/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @name        Design Send - Send Design Suitelet
 * @description Builds the Send Design form for an Opportunity (sender, recipients and
 *              up to five drawings), then saves the drawings to the File Cabinet and
 *              sends the installation-drawings email from the chosen sender.
 * @version     1.0.0
 *
 * Script ID:      customscript_dsn_sl_send_design
 * Deployment ID:  customdeploy_dsn_sl_send_design
 *
 * Script parameters on this record:
 *   custscript_dsn_salesrep_default_props - value proposition IDs defaulting to the
 *                                           sales rep
 *   custscript_dsn_attachment_folder      - File Cabinet folder for saved drawings
 *
 * HELPER LINEAGE
 *   parseEmails, validateEmailField and escapeHtml originate from
 *   nuheat_send_quote_sl.js / nuheat_send_quote_cs.js (2026 Quote project). They are
 *   copied into lib/dsn_lib_config.js rather than imported, because these scripts live
 *   in their own File Cabinet folder and cannot './' import the 2026 Quote modules.
 *
 * WHY VALIDATION IS SERVER-SIDE
 *   Send Quote renders its email boxes as inline HTML over hidden NetSuite fields and
 *   syncs them by writing hidden.value from the DOM, while validating with
 *   rec.getValue() - which reads the client-side model. The two can disagree, so
 *   validation can pass on a stale value while the POST carries a different one. Here
 *   To/CC/BCC are ordinary visible fields and every check runs on POST against what
 *   was actually submitted, so nothing can reach email.send unchecked.
 */

define([
    'N/ui/serverWidget',
    'N/record',
    'N/search',
    'N/runtime',
    'N/email',
    'N/file',
    'N/url',
    'N/log',
    './lib/dsn_lib_config',
    './dsn_email_template'
],
function (serverWidget, record, search, runtime, email, file, url, log, config, template) {

    'use strict';

    var SCRIPT_VERSION = '1.0.0';

    var FLD = {
        OPPORTUNITY_ID: 'custpage_dsn_opportunity_id',
        NOTICE:         'custpage_dsn_notice',
        SENDER:         'custpage_dsn_sender',
        CONTACT:        'custpage_dsn_contact',
        TO:             'custpage_dsn_to',
        CC:             'custpage_dsn_cc',
        BCC:            'custpage_dsn_bcc',
        CONTACT_MAP:    'custpage_dsn_contact_map',
        FILE_PREFIX:    'custpage_dsn_file_'
    };

    /** Sender candidate keys. The form posts one of these, never an employee ID: the
     *  candidates are re-resolved from the record on POST rather than trusted from the
     *  client. */
    var SENDER_SALES_REP = 'salesrep';
    var SENDER_PROJECT_ENGINEER = 'pe';
    var SENDER_CURRENT_USER = 'user';

    // --- Entry point ---------------------------------------------------------

    function onRequest(context) {
        var opportunityId;

        log.audit('dsn_sl_send_design.onRequest',
            'Method: ' + context.request.method + ' | v' + SCRIPT_VERSION);

        try {
            // Fails loudly and immediately when the attachment folder is unset, so the
            // user learns before choosing a sender and attaching five drawings rather
            // than after.
            config.getAttachmentFolder();

            if (context.request.method === 'GET') {
                opportunityId = context.request.parameters.opportunityId;
                showForm(context, opportunityId, {});
            } else {
                handleSubmit(context);
            }
        } catch (e) {
            log.error('dsn_sl_send_design.onRequest',
                'Unhandled error: ' + e.message + '\n' + e.stack);
            showMessagePage(context, 'Send Design could not continue', e.message, '');
        }
    }

    // --- GET: build the form -------------------------------------------------

    /**
     * @param {Object} context
     * @param {string} opportunityId
     * @param {Object} options
     * @param {Array<string>} [options.errors] messages to show in a banner
     * @param {Object} [options.values] previously submitted sender/to/cc/bcc to restore
     */
    function showForm(context, opportunityId, options) {
        var opts = options || {};
        var values = opts.values || {};
        var errors = opts.errors || [];
        var data;
        var form;
        var senderField;
        var contactField;
        var noticeHtml;
        var defaultSenderKey;
        var i;

        if (!opportunityId) {
            showMessagePage(context, 'No Opportunity',
                'No Opportunity ID was supplied. Please open this page using the ' +
                'Send Design button on an Opportunity record.', '');
            return;
        }

        data = loadOpportunityContext(opportunityId);

        if (data.candidates.length === 0) {
            // Unreachable in practice - the current user is always a candidate - but a
            // form with an empty sender list would send from nobody.
            showMessagePage(context, 'No available sender',
                'No sender could be resolved for this Opportunity. The sales rep, the ' +
                'project engineer and the current user all failed to load. Please check ' +
                'the execution log.', opportunityId);
            return;
        }

        form = serverWidget.createForm({ title: 'Send Design' });

        defaultSenderKey = values.senderKey || data.defaultSenderKey;

        noticeHtml = buildNoticeHtml(data, errors);
        if (noticeHtml) {
            form.addField({
                id:    FLD.NOTICE,
                type:  serverWidget.FieldType.INLINEHTML,
                label: ' '
            }).defaultValue = noticeHtml;
        }

        addHiddenText(form, FLD.OPPORTUNITY_ID, 'Opportunity ID', opportunityId);

        // --- Sender ---
        senderField = form.addField({
            id:    FLD.SENDER,
            type:  serverWidget.FieldType.SELECT,
            label: 'Send As'
        });
        senderField.isMandatory = true;
        for (i = 0; i < data.candidates.length; i++) {
            senderField.addSelectOption({
                value:      data.candidates[i].key,
                text:       buildSenderLabel(data.candidates[i]),
                isSelected: data.candidates[i].key === defaultSenderKey
            });
        }

        // --- Contact selector ---
        // Options are keyed on the contact's INTERNAL ID. Send Quote keys them on the
        // email address, so every contact without one gets value '' - the same value as
        // the placeholder - and becomes unselectable.
        contactField = form.addField({
            id:    FLD.CONTACT,
            type:  serverWidget.FieldType.SELECT,
            label: 'Select Contact'
        });
        contactField.addSelectOption({ value: '', text: '-- Select a contact to fill To --' });
        for (i = 0; i < data.contacts.length; i++) {
            contactField.addSelectOption({
                value: data.contacts[i].id,
                text:  buildContactLabel(data.contacts[i])
            });
        }

        // Contact id -> email, for the client script to read when a contact is picked.
        // A hidden LONGTEXT, not a hidden mirror of a visible input: the client script
        // reads it with rec.getValue and writes the To field with rec.setValue, so the
        // record model stays the single source of truth throughout.
        addHiddenLongText(form, FLD.CONTACT_MAP, 'Contact Emails',
            buildContactEmailMap(data.contacts));

        // --- Recipients: ordinary visible fields ---
        addVisibleText(form, FLD.TO, 'To',
            values.to === undefined ? data.customerEmail : values.to,
            'Separate multiple addresses with commas.');
        addVisibleText(form, FLD.CC, 'CC', values.cc || '', '');
        addVisibleText(form, FLD.BCC, 'BCC', values.bcc || '', '');

        // --- Attachments ---
        for (i = 1; i <= config.ATTACHMENT_FIELD_COUNT; i++) {
            form.addField({
                id:    FLD.FILE_PREFIX + i,
                type:  serverWidget.FieldType.FILE,
                label: 'Attachment ' + i
            });
        }

        form.addSubmitButton({ label: 'Send Design' });
        form.addButton({
            id:           'custpage_dsn_cancel',
            label:        'Cancel',
            functionName: 'dsnCancel'
        });

        form.clientScriptModulePath = './dsn_cs_send_design.js';

        context.response.writePage(form);
    }

    /**
     * The banner above the form: submission errors first, then the "defaulted to you"
     * explanation if it applies.
     */
    function buildNoticeHtml(data, errors) {
        var html = [];
        var i;

        if (errors && errors.length) {
            html.push('<div style="border:2px solid #c00; background:#fff4f4; padding:12px; margin-bottom:12px;">');
            html.push('<strong>Nothing has been sent.</strong><ul style="margin:8px 0 0 18px;">');
            for (i = 0; i < errors.length; i++) {
                html.push('<li>' + config.escapeHtml(errors[i]) + '</li>');
            }
            html.push('</ul>');
            html.push('<p style="margin:8px 0 0 0;">Please re-attach your drawings before ' +
                      'submitting again - a browser cannot restore file selections.</p>');
            html.push('</div>');
        }

        if (data.defaultedToCurrentUser) {
            // Stated plainly, because otherwise somebody sends as themselves without
            // noticing that neither the sales rep nor the project engineer was set.
            html.push('<div style="border:2px solid #E35205; background:#fff8f2; padding:12px; margin-bottom:12px;">');
            html.push('<strong>This email will be sent from you.</strong> ');
            html.push('Neither a sales rep nor a project engineer is set on this ' +
                      'Opportunity, so the sender has defaulted to your own user record. ');
            html.push('Check the <em>Send As</em> field before sending.');
            html.push('</div>');
        }

        return html.join('');
    }

    function buildSenderLabel(candidate) {
        var label = candidate.name + ' - ' + candidate.roleLabel;
        if (candidate.email) {
            label = label + ' (' + candidate.email + ')';
        } else {
            label = label + ' (no email on employee record)';
        }
        return label;
    }

    function buildContactLabel(contact) {
        if (contact.email) {
            return contact.name + ' (' + contact.email + ')';
        }
        return contact.name + ' (no email)';
    }

    function addVisibleText(form, fieldId, label, value, help) {
        var field = form.addField({
            id:    fieldId,
            type:  serverWidget.FieldType.TEXT,
            label: label
        });
        if (help) { field.setHelpText({ help: help }); }
        if (value) { field.defaultValue = value; }
        return field;
    }

    /**
     * JSON of contact internal ID -> email address. Contacts with no email are included
     * with an empty string, so the client script can tell "no email recorded" apart
     * from "not a contact on this Opportunity" and leave the To field alone either way.
     */
    function buildContactEmailMap(contacts) {
        var map = {};
        var i;
        for (i = 0; i < contacts.length; i++) {
            map[contacts[i].id] = contacts[i].email || '';
        }
        return JSON.stringify(map);
    }

    function addHiddenLongText(form, fieldId, label, value) {
        var field = form.addField({
            id:    fieldId,
            type:  serverWidget.FieldType.LONGTEXT,
            label: label
        });
        if (value) { field.defaultValue = value; }
        field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        return field;
    }

    function addHiddenText(form, fieldId, label, value) {
        var field = form.addField({
            id:    fieldId,
            type:  serverWidget.FieldType.TEXT,
            label: label
        });
        if (value) { field.defaultValue = value; }
        field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        return field;
    }

    // --- Reading the Opportunity ---------------------------------------------

    /**
     * Everything the form and the send need from the Opportunity, resolved once.
     */
    function loadOpportunityContext(opportunityId) {
        var oppRecord;
        var salesRepId;
        var projectEngineerId;
        var valueProposition;
        var customerId;
        var candidates;
        var defaultKey;

        oppRecord = record.load({
            type: record.Type.OPPORTUNITY,
            id:   opportunityId
        });

        salesRepId        = oppRecord.getValue({ fieldId: config.FIELD.SALES_REP });
        projectEngineerId = oppRecord.getValue({ fieldId: config.FIELD.PROJECT_ENGINEER });
        valueProposition  = oppRecord.getValue({ fieldId: config.FIELD.VALUE_PROPOSITION });
        customerId        = oppRecord.getValue({ fieldId: config.FIELD.ENTITY });

        candidates = buildSenderCandidates(salesRepId, projectEngineerId);
        defaultKey = chooseDefaultSenderKey(candidates, valueProposition);

        return {
            id:              opportunityId,
            tranId:          oppRecord.getValue({ fieldId: config.FIELD.TRAN_ID }) || '',
            title:           oppRecord.getValue({ fieldId: config.FIELD.TITLE }) || '',
            customerId:      customerId,
            customerName:    oppRecord.getText({ fieldId: config.FIELD.ENTITY }) || '',
            customerEmail:   lookupCustomerEmail(customerId),
            contacts:        loadContacts(opportunityId),
            candidates:      candidates,
            defaultSenderKey: defaultKey,
            defaultedToCurrentUser: defaultKey === SENDER_CURRENT_USER &&
                                    !findCandidate(candidates, SENDER_SALES_REP) &&
                                    !findCandidate(candidates, SENDER_PROJECT_ENGINEER)
        };
    }

    /**
     * Builds the list of people who may author the email. The current user is always
     * offered last, so there is a sender even on an Opportunity with neither role set.
     *
     * When the same employee is both sales rep and project engineer they appear twice.
     * That is deliberate: the two entries differ in the role label and in the address
     * printed in the body (the shared design mailbox for a PE, their own for a rep), so
     * they are genuinely different choices.
     */
    function buildSenderCandidates(salesRepId, projectEngineerId) {
        var candidates = [];
        var currentUserId = runtime.getCurrentUser().id;
        var candidate;

        candidate = buildCandidate(SENDER_SALES_REP, salesRepId, config.ROLE_ACCOUNT_MANAGER);
        if (candidate) { candidates.push(candidate); }

        candidate = buildCandidate(SENDER_PROJECT_ENGINEER, projectEngineerId, config.ROLE_PROJECT_ENGINEER);
        if (candidate) { candidates.push(candidate); }

        candidate = buildCandidate(SENDER_CURRENT_USER, currentUserId, config.ROLE_ACCOUNT_MANAGER);
        if (candidate) { candidates.push(candidate); }

        return candidates;
    }

    function buildCandidate(key, employeeId, roleLabel) {
        var employee;

        if (!employeeId) { return null; }

        employee = loadEmployee(employeeId);
        if (!employee) { return null; }

        return {
            key:        key,
            employeeId: employeeId,
            name:       employee.name,
            email:      employee.email,
            phone:      employee.phone,
            roleLabel:  roleLabel
        };
    }

    /**
     * Reads a sender's details from the Employee record.
     *
     * The phone is officephone ALONE. There is no fallback to phone, and none to the
     * Opportunity's override fields (custbody_pe_phone, custbodycustbody_pe_email -
     * the doubled prefix is that field's real stored ID). One source of truth: the
     * employee record is maintained once per person and is then correct on every
     * Opportunity, whereas a per-Opportunity copy drifts silently the moment somebody
     * changes desk or number.
     *
     * A failed load is logged at ERROR and the candidate is dropped from the list. It
     * is deliberately NOT swallowed: the 2026 Quote module logs the same condition via
     * safeLog('warn'), which is silently discarded because log.warn does not exist, and
     * then sends the email anyway under a branded fallback name.
     */
    function loadEmployee(employeeId) {
        var employeeRecord;
        var firstName;
        var lastName;
        var name;

        try {
            employeeRecord = record.load({
                type: record.Type.EMPLOYEE,
                id:   employeeId
            });
        } catch (e) {
            log.error('dsn_sl_send_design.loadEmployee',
                'Could not load employee ' + employeeId + ': ' + e.message +
                ' - this person will not be offered as a sender.');
            return null;
        }

        firstName = employeeRecord.getValue({ fieldId: config.FIELD.EMPLOYEE_FIRST }) || '';
        lastName  = employeeRecord.getValue({ fieldId: config.FIELD.EMPLOYEE_LAST }) || '';
        name = (firstName + ' ' + lastName).trim();

        if (!name) {
            log.error('dsn_sl_send_design.loadEmployee',
                'Employee ' + employeeId + ' has no first or last name. Offering them as ' +
                'a sender would print an empty name in the email body.');
            return null;
        }

        return {
            id:    employeeId,
            name:  name,
            email: (employeeRecord.getValue({ fieldId: config.FIELD.EMPLOYEE_EMAIL }) || '').trim(),
            phone: (employeeRecord.getValue({ fieldId: config.FIELD.EMPLOYEE_PHONE }) || '').trim()
        };
    }

    /**
     * Default sender:
     *   value proposition in the parameter list -> sales rep
     *   otherwise                               -> project engineer
     *   project engineer blank                  -> sales rep
     *   both blank                              -> current user
     *
     * Expressed as a preference order so that the case the brief does not name - value
     * proposition prefers the sales rep, but no sales rep is set - also has a defined
     * answer (project engineer, then current user) rather than falling off the end.
     */
    function chooseDefaultSenderKey(candidates, valueProposition) {
        var prefersSalesRep = config.listContains(
            config.getSalesRepDefaultProps(), valueProposition);
        var order = prefersSalesRep
            ? [SENDER_SALES_REP, SENDER_PROJECT_ENGINEER, SENDER_CURRENT_USER]
            : [SENDER_PROJECT_ENGINEER, SENDER_SALES_REP, SENDER_CURRENT_USER];
        var i;

        for (i = 0; i < order.length; i++) {
            if (findCandidate(candidates, order[i])) {
                return order[i];
            }
        }
        return SENDER_CURRENT_USER;
    }

    function findCandidate(candidates, key) {
        var i;
        for (i = 0; i < candidates.length; i++) {
            if (candidates[i].key === key) { return candidates[i]; }
        }
        return null;
    }

    function lookupCustomerEmail(customerId) {
        var fields;
        if (!customerId) { return ''; }
        try {
            fields = search.lookupFields({
                type:    search.Type.CUSTOMER,
                id:      customerId,
                columns: ['email']
            });
            return fields.email || '';
        } catch (e) {
            log.error('dsn_sl_send_design.lookupCustomerEmail',
                'Could not read the email of customer ' + customerId + ': ' + e.message);
            return '';
        }
    }

    /**
     * Contacts linked to the Opportunity. Same search shape as Send Quote; only the
     * dropdown keying differs.
     */
    function loadContacts(opportunityId) {
        var contacts = [];
        var contactSearch;

        try {
            contactSearch = search.create({
                type: search.Type.OPPORTUNITY,
                filters: [
                    ['internalid', 'anyof', opportunityId]
                ],
                columns: [
                    search.createColumn({ name: 'internalid', join: 'contact' }),
                    search.createColumn({ name: 'firstname',  join: 'contact' }),
                    search.createColumn({ name: 'lastname',   join: 'contact' }),
                    search.createColumn({ name: 'email',      join: 'contact' })
                ]
            });

            contactSearch.run().each(function (result) {
                var contactId = result.getValue({ name: 'internalid', join: 'contact' });
                var firstName;
                var lastName;

                if (!contactId) { return true; }

                firstName = result.getValue({ name: 'firstname', join: 'contact' }) || '';
                lastName  = result.getValue({ name: 'lastname',  join: 'contact' }) || '';

                contacts.push({
                    id:    contactId,
                    name:  (firstName + ' ' + lastName).trim() || 'Contact ' + contactId,
                    email: result.getValue({ name: 'email', join: 'contact' }) || ''
                });
                return true;
            });
        } catch (e) {
            log.error('dsn_sl_send_design.loadContacts',
                'Contact search failed for Opportunity ' + opportunityId + ': ' + e.message);
        }

        return contacts;
    }

    // --- POST: validate, save, send ------------------------------------------

    function handleSubmit(context) {
        var params = context.request.parameters;
        var opportunityId = params[FLD.OPPORTUNITY_ID];
        var submitted;
        var data;
        var sender;
        var errors;
        var uploads;
        var savedFiles;
        var attachments;
        var toList;
        var ccList;
        var bccList;
        var body;
        var subject;
        var senderEmailForBody;

        if (!opportunityId) {
            showMessagePage(context, 'No Opportunity',
                'The submission carried no Opportunity ID, so nothing was sent.', '');
            return;
        }

        submitted = {
            senderKey: (params[FLD.SENDER] || '').trim(),
            to:        (params[FLD.TO] || '').trim(),
            cc:        (params[FLD.CC] || '').trim(),
            bcc:       (params[FLD.BCC] || '').trim()
        };

        // Re-resolved from the record, never taken from the client.
        data = loadOpportunityContext(opportunityId);
        sender = findCandidate(data.candidates, submitted.senderKey);

        uploads = collectUploads(context.request.files);

        errors = validateSubmission(sender, submitted, uploads);
        if (errors.length > 0) {
            log.audit('dsn_sl_send_design.handleSubmit',
                'Refused before saving anything. Opportunity ' + opportunityId +
                ' | ' + errors.join(' | '));
            showForm(context, opportunityId, { errors: errors, values: submitted });
            return;
        }

        // Saving happens only once everything above has passed, so an invalid address
        // or an oversized drawing never leaves a file behind in the File Cabinet.
        savedFiles = saveUploads(uploads, data.tranId);

        attachments = loadSavedFiles(savedFiles);

        toList  = config.parseEmails(submitted.to);
        ccList  = config.parseEmails(submitted.cc);
        bccList = config.parseEmails(submitted.bcc);

        senderEmailForBody = (sender.roleLabel === config.ROLE_PROJECT_ENGINEER)
            ? config.SHARED_DESIGN_EMAIL
            : sender.email;

        body = template.buildBody({
            projectRef:  buildProjectRef(data),
            senderRole:  sender.roleLabel,
            senderName:  sender.name,
            senderEmail: senderEmailForBody,
            senderPhone: sender.phone
        });

        subject = 'Your installation drawings - ' + buildProjectRef(data);

        sendEmail({
            sender:        sender,
            toList:        toList,
            ccList:        ccList,
            bccList:       bccList,
            subject:       subject,
            body:          body,
            attachments:   attachments,
            customerId:    data.customerId,
            opportunityId: opportunityId
        });

        showSuccessPage(context, data, sender, submitted, savedFiles, senderEmailForBody);
    }

    /**
     * Reads the FILE fields off the request. A field the user left empty is simply
     * absent from request.files, so presence is tested rather than assumed.
     */
    function collectUploads(files) {
        var uploads = [];
        var requestFiles = files || {};
        var i;
        var fieldId;
        var fileObj;

        for (i = 1; i <= config.ATTACHMENT_FIELD_COUNT; i++) {
            fieldId = FLD.FILE_PREFIX + i;
            fileObj = requestFiles[fieldId];
            if (fileObj) {
                uploads.push({
                    fieldId:  fieldId,
                    position: i,
                    fileObj:  fileObj,
                    name:     fileObj.name,
                    size:     fileObj.size
                });
            }
        }
        return uploads;
    }

    /**
     * Every check that must pass before anything is saved or sent. All failures are
     * collected so the user sees the whole list at once rather than one per attempt.
     */
    function validateSubmission(sender, submitted, uploads) {
        var errors = [];
        var i;

        if (!sender) {
            errors.push('Please choose who the email is sent from.');
        }

        if (!submitted.to) {
            errors.push('A "To" address is required.');
        } else if (!config.validateEmailField(submitted.to)) {
            errors.push('The "To" address is not a valid email address: ' + submitted.to);
        }

        if (submitted.cc && !config.validateEmailField(submitted.cc)) {
            errors.push('One or more CC addresses are not valid: ' + submitted.cc);
        }

        if (submitted.bcc && !config.validateEmailField(submitted.bcc)) {
            errors.push('One or more BCC addresses are not valid: ' + submitted.bcc);
        }

        if (uploads.length === 0) {
            errors.push('Please attach at least one drawing.');
        }

        // Size is read from the unsaved request file, before any save is attempted.
        // file.save() throws SSS_FILE_CONTENT_SIZE_EXCEEDED above 10 MB, which tells the
        // user nothing they can act on; naming the file and the limit tells them to
        // compress or split it.
        for (i = 0; i < uploads.length; i++) {
            if (isOversized(uploads[i])) {
                errors.push('"' + uploads[i].name + '" is ' +
                    describeSize(uploads[i].size) + ', which is over the ' +
                    describeSize(config.MAX_ATTACHMENT_BYTES) + ' limit for a single ' +
                    'attachment. Please compress it or split it, then try again. ' +
                    'Nothing has been saved or sent.');
            }
        }

        return errors;
    }

    /**
     * A size that cannot be read is treated as acceptable rather than as a refusal:
     * file.save() will enforce the real limit regardless, and refusing a drawing whose
     * size merely could not be measured would block legitimate sends. The spike
     * confirmed size IS populated on unsaved request files, so this is a guard against
     * future change, not the expected path - hence the audit log.
     */
    function isOversized(upload) {
        var size = Number(upload.size);

        if (!isFinite(size) || size <= 0) {
            log.audit('dsn_sl_send_design.isOversized',
                'Could not read a usable size for "' + upload.name + '" (raw value: ' +
                upload.size + '). Allowing it through; file.save() will enforce the limit.');
            return false;
        }
        return size > config.MAX_ATTACHMENT_BYTES;
    }

    function describeSize(bytes) {
        var mb = Number(bytes) / (1024 * 1024);
        return (Math.round(mb * 10) / 10) + ' MB';
    }

    /**
     * Saves each upload into the configured folder.
     *
     * FILE NAME COLLISIONS: the File Cabinet requires unique names within a folder, and
     * two Opportunities will both send "Drawing1.pdf". Every saved name is therefore
     * prefixed with the Opportunity's tranid and a timestamp:
     *
     *     <tranid>_<YYYYMMDD-HHMMSS>_<n>_<original name>
     *
     * The tranid scopes it to the Opportunity, the timestamp separates one send from
     * the next (including a resend of the same drawing after a redraw), and the index
     * separates files within a single send that happen to share a name.
     */
    function saveUploads(uploads, tranId) {
        var saved = [];
        var stamp = buildTimestamp(new Date());
        var i;
        var upload;
        var fileObj;
        var savedName;
        var fileId;

        for (i = 0; i < uploads.length; i++) {
            upload = uploads[i];
            fileObj = upload.fileObj;

            savedName = buildSavedFileName(tranId, stamp, upload.position, upload.name);

            fileObj.name = savedName;
            fileObj.folder = config.getAttachmentFolder();

            fileId = fileObj.save();

            log.audit('dsn_sl_send_design.saveUploads',
                'Saved "' + upload.name + '" as "' + savedName + '" (file ' + fileId + ').');

            saved.push({
                id:           fileId,
                savedName:    savedName,
                originalName: upload.name,
                size:         upload.size
            });
        }

        return saved;
    }

    /**
     * Keeps the extension, sanitises everything else to characters the File Cabinet is
     * comfortable with, and truncates the original portion so the whole name stays well
     * inside the File Cabinet's limit.
     */
    function buildSavedFileName(tranId, stamp, position, originalName) {
        var MAX_ORIGINAL_PART = 120;
        var safeTranId = sanitiseNamePart(tranId) || 'OPP';
        var name = String(originalName || 'drawing');
        var dotAt = name.lastIndexOf('.');
        var base = dotAt > 0 ? name.substring(0, dotAt) : name;
        var extension = dotAt > 0 ? name.substring(dotAt + 1) : '';

        base = sanitiseNamePart(base) || 'drawing';
        extension = sanitiseNamePart(extension);

        if (base.length > MAX_ORIGINAL_PART) {
            base = base.substring(0, MAX_ORIGINAL_PART);
        }

        return safeTranId + '_' + stamp + '_' + position + '_' + base +
               (extension ? '.' + extension : '');
    }

    /**
     * Reduces a name fragment to letters, digits, dot, underscore and hyphen.
     *
     * Runs of dots are collapsed to one and leading dots removed, so a name like
     * "Plan /../ v2.pdf" cannot leave a ".." sequence in the saved name. The File
     * Cabinet treats the name as a name rather than a path, so this is tidiness rather
     * than a security boundary - but a saved drawing called "Plan_.._v2.pdf" invites a
     * question nobody should have to answer.
     */
    function sanitiseNamePart(value) {
        if (value === null || value === undefined) { return ''; }
        return String(value)
            .replace(/[^A-Za-z0-9._-]+/g, '_')
            .replace(/\.{2,}/g, '.')
            .replace(/_+/g, '_')
            .replace(/^[_.]+/, '')
            .replace(/[_.]+$/, '');
    }

    function buildTimestamp(date) {
        return String(date.getFullYear()) +
            pad2(date.getMonth() + 1) +
            pad2(date.getDate()) + '-' +
            pad2(date.getHours()) +
            pad2(date.getMinutes()) +
            pad2(date.getSeconds());
    }

    function pad2(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function loadSavedFiles(savedFiles) {
        var attachments = [];
        var i;
        for (i = 0; i < savedFiles.length; i++) {
            attachments.push(file.load({ id: savedFiles[i].id }));
        }
        return attachments;
    }

    /**
     * The project reference printed in the body and carried in the confirmation
     * mailto's subject. The retired CAD Worklist field held a link to the Opportunity,
     * so the Opportunity's own transaction ID is the closest equivalent; the title is
     * used when there is no tranid.
     */
    function buildProjectRef(data) {
        return data.tranId || data.title || ('Opportunity ' + data.id);
    }

    function sendEmail(options) {
        var emailParams = {
            author:     options.sender.employeeId,
            recipients: options.toList,
            subject:    options.subject,
            body:       options.body,
            attachments: options.attachments,
            // transactionId puts the message on the Opportunity's Communication tab;
            // entityId puts it on the customer's. The || undefined is load-bearing: a
            // relatedRecords key must be omitted rather than passed empty.
            relatedRecords: {
                entityId:      options.customerId || undefined,
                transactionId: options.opportunityId
            }
        };

        if (options.ccList.length > 0)  { emailParams.cc  = options.ccList; }
        if (options.bccList.length > 0) { emailParams.bcc = options.bccList; }

        email.send(emailParams);

        log.audit('dsn_sl_send_design.sendEmail',
            'Sent for Opportunity ' + options.opportunityId +
            ' | from employee ' + options.sender.employeeId +
            ' (' + options.sender.name + ', ' + options.sender.roleLabel + ')' +
            ' | to ' + options.toList.join(', ') +
            ' | cc ' + (options.ccList.join(', ') || '(none)') +
            ' | bcc ' + (options.bccList.join(', ') || '(none)') +
            ' | ' + options.attachments.length + ' attachment(s)');
    }

    // --- Result pages --------------------------------------------------------

    function showSuccessPage(context, data, sender, submitted, savedFiles, senderEmailForBody) {
        var form = serverWidget.createForm({ title: 'Send Design - sent' });
        var html = [];
        var i;

        html.push('<div style="border:2px solid #00857D; background:#f2fbfa; padding:14px; margin-bottom:14px;">');
        html.push('<h2 style="margin:0 0 6px 0;">The design email has been sent.</h2>');
        html.push('<p style="margin:0;">It has been filed against Opportunity ' +
            config.escapeHtml(buildProjectRef(data)) +
            ', where it appears under Communication &gt; Messages.</p>');
        html.push('</div>');

        html.push('<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;">');
        html.push(row('From', config.escapeHtml(sender.name) + ' - ' +
            config.escapeHtml(sender.roleLabel) +
            (sender.email ? ' (' + config.escapeHtml(sender.email) + ')' : '')));
        html.push(row('Printed in the email', config.escapeHtml(senderEmailForBody) +
            (sender.phone ? ' and ' + config.escapeHtml(sender.phone)
                          : ' (no phone shown - the sender has no office phone recorded)')));
        html.push(row('To', config.escapeHtml(submitted.to)));
        html.push(row('CC', config.escapeHtml(submitted.cc) || '(none)'));
        html.push(row('BCC', config.escapeHtml(submitted.bcc) || '(none)'));
        html.push('</table>');

        html.push('<h3>Attachments saved and sent</h3>');
        html.push('<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;">');
        html.push('<tr style="background:#eee;"><th>Original name</th><th>Saved as</th><th>Size</th></tr>');
        for (i = 0; i < savedFiles.length; i++) {
            html.push('<tr><td>' + config.escapeHtml(savedFiles[i].originalName) + '</td>' +
                '<td>' + config.escapeHtml(savedFiles[i].savedName) + '</td>' +
                '<td>' + config.escapeHtml(describeSize(savedFiles[i].size)) + '</td></tr>');
        }
        html.push('</table>');

        addHiddenText(form, FLD.OPPORTUNITY_ID, 'Opportunity ID', data.id);

        form.addField({
            id:    'custpage_dsn_result',
            type:  serverWidget.FieldType.INLINEHTML,
            label: ' '
        }).defaultValue = html.join('');

        form.addButton({
            id:           'custpage_dsn_back',
            label:        'Back to Opportunity',
            functionName: 'dsnCancel'
        });
        form.clientScriptModulePath = './dsn_cs_send_design.js';

        context.response.writePage(form);
    }

    function row(label, value) {
        return '<tr><th align="left" style="background:#f4f4f4;">' + label + '</th><td>' +
               value + '</td></tr>';
    }

    function showMessagePage(context, heading, message, opportunityId) {
        var form = serverWidget.createForm({ title: 'Send Design' });

        form.addField({
            id:    'custpage_dsn_message',
            type:  serverWidget.FieldType.INLINEHTML,
            label: ' '
        }).defaultValue =
            '<div style="border:2px solid #c00; background:#fff4f4; padding:14px;">' +
            '<h2 style="margin:0 0 6px 0;">' + config.escapeHtml(heading) + '</h2>' +
            '<p style="margin:0;">' + config.escapeHtml(message) + '</p>' +
            '<p style="margin:8px 0 0 0;"><strong>Nothing has been sent.</strong></p>' +
            '</div>';

        if (opportunityId) {
            addHiddenText(form, FLD.OPPORTUNITY_ID, 'Opportunity ID', opportunityId);
            form.addButton({
                id:           'custpage_dsn_back',
                label:        'Back to Opportunity',
                functionName: 'dsnCancel'
            });
            form.clientScriptModulePath = './dsn_cs_send_design.js';
        }

        context.response.writePage(form);
    }

    return {
        onRequest: onRequest
    };

});
