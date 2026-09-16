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

    var SCRIPT_VERSION = '1.5.0';

    var FLD = {
        OPPORTUNITY_ID: 'custpage_dsn_opportunity_id',
        NOTICE:         'custpage_dsn_notice',
        SENDER:         'custpage_dsn_sender',
        CONTACT:        'custpage_dsn_contact',
        TO:             'custpage_dsn_to',
        CC:             'custpage_dsn_cc',
        BCC:            'custpage_dsn_bcc',
        CONTACT_MAP:    'custpage_dsn_contact_map',
        FILE_PREFIX:     'custpage_dsn_file_',
        CATEGORY_PREFIX: 'custpage_dsn_category_',
        LABEL_PREFIX:    'custpage_dsn_label_',
        ATTACH_TOO:      'custpage_dsn_attach_too',
        HEADING_PREFIX:  'custpage_dsn_heading_'
    };

    /**
     * Display widths, in characters, for the text inputs. NetSuite sizes a TEXT field to
     * a default that is too narrow to read an email address or a button label in, so the
     * ones that carry real content are widened explicitly.
     */
    var WIDTH_EMAIL_FIELD = 60;
    var WIDTH_LABEL_FIELD = 45;
    var WIDTH_FILE_FIELD  = 45;

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
        var toField;
        var ccField;
        var bccField;
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

        // Must happen before the sections are added: it changes how everything after it
        // is laid out.
        disableFieldBalancing(form);

        addSectionHeading(form, 'email', 'Email',
            'Who the email comes from, and who it goes to.');

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

        // Row 1 of the Email section.
        setRowLayout(senderField, 'start');
        setRowLayout(contactField, 'end');

        // Contact id -> email, for the client script to read when a contact is picked.
        // A hidden LONGTEXT, not a hidden mirror of a visible input: the client script
        // reads it with rec.getValue and writes the To field with rec.setValue, so the
        // record model stays the single source of truth throughout.
        addHiddenLongText(form, FLD.CONTACT_MAP, 'Contact Emails',
            buildContactEmailMap(data.contacts));

        // --- Recipients: ordinary visible fields. Row 2 of the Email section. ---
        // Each still accepts a comma separated list, exactly as before.
        toField  = addVisibleText(form, FLD.TO, 'To',
            values.to === undefined ? data.customerEmail : values.to,
            'Separate multiple addresses with commas.');
        ccField  = addVisibleText(form, FLD.CC, 'CC', values.cc || '',
            'Separate multiple addresses with commas.');
        bccField = addVisibleText(form, FLD.BCC, 'BCC', values.bcc || '',
            'Separate multiple addresses with commas.');

        setDisplayWidth(toField,  WIDTH_EMAIL_FIELD, 'To');
        setDisplayWidth(ccField,  WIDTH_EMAIL_FIELD, 'CC');
        setDisplayWidth(bccField, WIDTH_EMAIL_FIELD, 'BCC');

        setRowLayout(toField,  'start');
        setRowLayout(ccField,  'mid');
        setRowLayout(bccField, 'end');

        // --- Documents: file, category and link label per slot ---
        //
        // NOT in field groups. A FILE field cannot go in one - see addDocumentSlot.
        addSectionHeading(form, 'docs', 'Documents',
            'One row per document: choose the file, pick a category, and check the ' +
            'button label the customer will see. All ' +
            config.ATTACHMENT_FIELD_COUNT + ' rows can be used in any order - ' +
            'filling row 7 and leaving 4 to 6 empty is fine.');

        for (i = 1; i <= config.ATTACHMENT_FIELD_COUNT; i++) {
            addDocumentSlot(form, i, values);
        }

        addSectionHeading(form, 'options', 'Options', '');

        // Default UNTICKED: linking is the point of this feature, and attaching
        // reinstates the 10 MB per-file and 15 MB per-message limits.
        form.addField({
            id:    FLD.ATTACH_TOO,
            type:  serverWidget.FieldType.CHECKBOX,
            label: 'Also attach the files to the email'
        }).defaultValue = values.attachToo ? 'T' : 'F';

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

    /**
     * One document slot: the file, its category and its button label.
     *
     * WHY THESE ARE NOT IN A FIELD GROUP. NetSuite documents that a FILE field "is
     * available only for Suitelets and will appear on the main tab of the Suitelet
     * page", and that FILE fields "cannot be added to tabs, subtabs, sublists, or field
     * groups". Putting a document's file input in one group while its category and label
     * sat in another - or worse, separating the file from the two fields describing it -
     * would be harder to use than no grouping at all. Sections are drawn with inline
     * HTML headings instead, which keeps each document's three fields together and in
     * the right order.
     *
     * The same constraint is why slots 4 to 10 are not collapsed: collapsing needs a
     * field group, a field group cannot hold the FILE field, and hiding fields with DOM
     * manipulation was ruled out for this form in Phase 0.
     *
     * The three fields are laid across one row with START/MID/END. If NetSuite declines
     * to honour that on the FILE field - which its own restrictions make plausible, and
     * which no documentation confirms either way - the visible result is the file on its
     * own line with the category and label beside it. That still reads correctly and in
     * the right order, so the layout degrades rather than breaks.
     */
    function addDocumentSlot(form, position, values) {
        var fileField;
        var categoryField;
        var labelField;

        // The file field's LABEL carries the row number. NetSuite renders labels in their
        // own column ahead of the controls, so "Document 7" lines up under "Document 6"
        // and the number effectively becomes the narrow left-hand column of the table.
        // There is no native header row, so the labels do that job on every row instead.
        fileField = form.addField({
            id:    FLD.FILE_PREFIX + position,
            type:  serverWidget.FieldType.FILE,
            label: 'Document ' + position
        });
        setDisplayWidth(fileField, WIDTH_FILE_FIELD, 'Document ' + position + ' file');

        // Sourced from the custom list by SCRIPT ID, so the client can add categories
        // without a deployment.
        categoryField = form.addField({
            id:     FLD.CATEGORY_PREFIX + position,
            type:   serverWidget.FieldType.SELECT,
            label:  'Category',
            source: config.LINK_CATEGORY_LIST
        });
        categoryField.defaultValue = slotValue(values, position, 'category');

        labelField = form.addField({
            id:    FLD.LABEL_PREFIX + position,
            type:  serverWidget.FieldType.TEXT,
            label: 'Button label'
        });
        labelField.setHelpText({
            help: 'Shown on the button the customer clicks. Choosing a category fills ' +
                  'this in; edit it freely, for example "Design drawings for Flat 1".'
        });
        labelField.defaultValue = slotValue(values, position, 'label');
        setDisplayWidth(labelField, WIDTH_LABEL_FIELD, 'Document ' + position + ' label');

        setRowLayout(fileField, 'start');
        setRowLayout(categoryField, 'mid');
        setRowLayout(labelField, 'end');
    }

    /**
     * Positions a field within a row.
     *
     * Wrapped in try/catch because updateLayoutType is presentation only: a field type
     * that refuses a layout must not take the whole form down with it. A refusal is
     * logged once at debug, not at error - the form is still perfectly usable, just
     * stacked rather than laid across.
     */
    function setRowLayout(field, position) {
        var layoutTypes = {
            start: serverWidget.FieldLayoutType.STARTROW,
            mid:   serverWidget.FieldLayoutType.MIDROW,
            end:   serverWidget.FieldLayoutType.ENDROW
        };

        setLayoutType(field, layoutTypes[position], 'row position "' + position + '"');
    }

    /**
     * Applies a break type, guarded, for the same reason as setLayoutType.
     */
    function setBreakType(field, breakType, description) {
        if (!field || !breakType) { return; }

        try {
            field.updateBreakType({ breakType: breakType });
        } catch (e) {
            log.debug('dsn_sl_send_design.setBreakType',
                'Could not apply a break type to ' + description + ': ' + e.message +
                ' - cosmetic only.');
        }
    }

    /**
     * Widens an input. NetSuite's default width for a TEXT field is too narrow to read an
     * email address or a button label in, and a FILE field's default is too narrow to show
     * the name of the file somebody just chose.
     *
     * Guarded: display size is not supported on every field type, and a field type that
     * refuses it must not take the form down over a cosmetic setting. A FILE field in
     * particular may well refuse.
     */
    function setDisplayWidth(field, width, description) {
        if (!field) { return; }

        try {
            field.updateDisplaySize({ height: 1, width: width });
        } catch (e) {
            log.debug('dsn_sl_send_design.setDisplayWidth',
                'Could not set a display width on ' + description + ': ' + e.message +
                ' - the field keeps its default width, which is cosmetic only.');
        }
    }

    /**
     * Turns off NetSuite's automatic field balancing for the whole form.
     *
     * This is the root cause of the reported layout. Left on, NetSuite distributes main
     * tab fields across its three-column grid to balance their heights - which is exactly
     * how the Email section ended up in a narrow column, document slots split between
     * columns, and Options beside Document 10. No amount of per-field layout fixes that
     * while the balancer is still redistributing everything around them.
     *
     * FieldBreakType.STARTCOL is documented to move its own field into a new column AND to
     * "disable automatic field balancing if set on any field". It is that side effect that
     * is wanted here, not the column break - so it is applied to the HIDDEN Opportunity ID
     * field, where starting a new column is invisible and harmless.
     *
     * The Phase 2c brief suggested STARTCOL was the thing to avoid. That is right about
     * its primary effect and, I think, wrong about its side effect: switching the balancer
     * off is the one documented lever that addresses the actual cause rather than its
     * symptoms. If Sandbox shows it misbehaving, the fallback is to move it to the first
     * visible field, or to drop it and accept the balancer.
     *
     * UNVERIFIED: whether a HIDDEN field's break type is honoured at all. If the form
     * still balances, that is the first thing to test.
     */
    function disableFieldBalancing(form) {
        var field;

        try {
            field = form.getField({ id: FLD.OPPORTUNITY_ID });
        } catch (e) {
            log.debug('dsn_sl_send_design.disableFieldBalancing',
                'Could not find the field to carry the balancing switch: ' + e.message);
            return;
        }

        setBreakType(field, serverWidget.FieldBreakType.STARTCOL,
            'the automatic field balancing switch');
    }

    /**
     * Applies a layout type, guarded.
     *
     * Layout is presentation only, so a field type that refuses one must not take the
     * whole form down with it. A refusal is logged at debug, not error: the form is still
     * perfectly usable, just laid out differently from the intent.
     */
    function setLayoutType(field, layoutType, description) {
        if (!field || !layoutType) { return; }

        try {
            field.updateLayoutType({ layoutType: layoutType });
        } catch (e) {
            log.debug('dsn_sl_send_design.setLayoutType',
                'Could not apply ' + description + ': ' + e.message +
                ' - the field will fall back to the default flow, which is cosmetic only.');
        }
    }

    /**
     * A section heading drawn as inline HTML, standing in for a field group.
     *
     * Field groups are unavailable for the document sections because they cannot contain
     * a FILE field (see addDocumentSlot), and a form that grouped some sections natively
     * and others with headings would look accidental. So every section is drawn the same
     * way.
     */
    function addSectionHeading(form, key, title, blurb) {
        var field;
        var html = '<div style="border-top:2px solid #00857D; margin:18px 0 6px 0; ' +
                   'padding-top:8px; width:100%;">' +
                   '<span style="font-size:15px; font-weight:600; color:#00857D;">' +
                   config.escapeHtml(title) + '</span>';

        if (blurb) {
            html = html + '<div style="font-size:12px; color:#555; margin-top:2px;">' +
                   config.escapeHtml(blurb) + '</div>';
        }
        html = html + '</div>';

        field = form.addField({
            id:    FLD.HEADING_PREFIX + key,
            type:  serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        field.defaultValue = html;

        // OUTSIDE renders the field across the FULL form width, outside NetSuite's column
        // grid. On its own that was not enough - Phase 2b set OUTSIDEABOVE and sections
        // still shared columns - because a layout type says WHERE a field sits, not that
        // a new row begins.
        //
        // The missing half is the BREAK type. FieldBreakType.STARTROW "places a field
        // located outside of a field group on a new row", and is documented to work ONLY
        // on fields whose layout type is OUTSIDE, OUTSIDEABOVE or OUTSIDEBELOW - which is
        // precisely this pairing. Setting one without the other does nothing useful, and
        // that is the likeliest reason the previous attempt did not stack.
        setLayoutType(field, serverWidget.FieldLayoutType.OUTSIDE,
            'section heading "' + title + '"');
        setBreakType(field, serverWidget.FieldBreakType.STARTROW,
            'section heading "' + title + '"');

        return field;
    }

    /**
     * A previously submitted category or label for slot n, so a refused submission does
     * not make the user retype every label. The file selections themselves cannot be
     * restored - no browser allows it - which is exactly why the labels should be.
     */
    function slotValue(values, position, key) {
        var slots = values && values.slots;
        var slot = slots && slots[position];
        if (!slot) { return ''; }
        return slot[key] || '';
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
            bcc:       (params[FLD.BCC] || '').trim(),
            attachToo: params[FLD.ATTACH_TOO] === 'T',
            slots:     collectSlotValues(params)
        };

        // Re-resolved from the record, never taken from the client.
        data = loadOpportunityContext(opportunityId);
        sender = findCandidate(data.candidates, submitted.senderKey);

        uploads = collectUploads(context.request.files, params);
        resolveDocumentLabels(uploads);

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

        // Attachments only when the user asked for them. Linking alone is the default,
        // and is what removes the 15 MB ceiling from the common case.
        attachments = submitted.attachToo ? collectAttachments(savedFiles) : [];

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
            senderPhone: sender.phone,
            documents:   buildDocumentList(savedFiles),
            attachFiles: submitted.attachToo
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
    function collectUploads(files, params) {
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
                    fieldId:    fieldId,
                    position:   i,
                    fileObj:    fileObj,
                    name:       fileObj.name,
                    size:       fileObj.size,
                    categoryId: (params[FLD.CATEGORY_PREFIX + i] || '').trim(),
                    labelRaw:   (params[FLD.LABEL_PREFIX + i] || '').trim(),
                    label:      ''
                });
            }
        }
        return uploads;
    }

    /**
     * The submitted category and label for every slot, kept so a refused submission can
     * be re-rendered without the user retyping. Indexed by slot position.
     */
    function collectSlotValues(params) {
        var slots = {};
        var i;
        for (i = 1; i <= config.ATTACHMENT_FIELD_COUNT; i++) {
            slots[i] = {
                category: (params[FLD.CATEGORY_PREFIX + i] || '').trim(),
                label:    (params[FLD.LABEL_PREFIX + i] || '').trim()
            };
        }
        return slots;
    }

    /**
     * Settles the button label for each uploaded document.
     *
     * The user's text wins. When they have cleared it, the category name is used, so a
     * document can never produce an unlabelled button - a yellow button with nothing on
     * it tells the customer nothing and looks broken. When neither is available the slot
     * is left without a label and validateSubmission refuses the send, naming it.
     */
    function resolveDocumentLabels(uploads) {
        var i;
        var upload;

        for (i = 0; i < uploads.length; i++) {
            upload = uploads[i];

            if (upload.labelRaw) {
                upload.label = upload.labelRaw;
                continue;
            }

            upload.label = lookupCategoryName(upload.categoryId);

            if (upload.label) {
                log.audit('dsn_sl_send_design.resolveDocumentLabels',
                    'Document ' + upload.position + ' ("' + upload.name + '") had no ' +
                    'label; falling back to the category name "' + upload.label + '".');
            }
        }
    }

    /**
     * The display name of a link category.
     *
     * Looked up by the list's SCRIPT ID, never a numeric internal ID, so the client can
     * add categories to customlist_dsn_link_category without a deployment.
     *
     * A failed lookup returns '' rather than throwing. The consequence is not silence:
     * an upload with no label and no resolvable category is refused by name in
     * validateSubmission, so the send stops either way - but it stops with a message the
     * user can act on rather than a stack trace.
     */
    function lookupCategoryName(categoryId) {
        var fields;

        if (!categoryId) { return ''; }

        try {
            fields = search.lookupFields({
                type:    config.LINK_CATEGORY_LIST,
                id:      categoryId,
                columns: ['name']
            });
            return (fields && fields.name) ? String(fields.name).trim() : '';
        } catch (e) {
            log.error('dsn_sl_send_design.lookupCategoryName',
                'Could not read the name of category ' + categoryId + ' from ' +
                config.LINK_CATEGORY_LIST + ': ' + e.message);
            return '';
        }
    }

    /**
     * Every check that must pass before anything is saved or sent. All failures are
     * collected so the user sees the whole list at once rather than one per attempt.
     */
    function validateSubmission(sender, submitted, uploads) {
        var errors = [];
        var totalBytes = 0;
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

        // Every document needs a button label. Unchanged by Phase 2's link/attach split:
        // an unlabelled button is useless whether or not the file is also attached.
        for (i = 0; i < uploads.length; i++) {
            if (!uploads[i].label) {
                errors.push('Document ' + uploads[i].position + ' ("' + uploads[i].name +
                    '") has no button label and no category to fall back on. Please ' +
                    'choose a category or type a label for it.');
            }
        }

        // ALWAYS ENFORCED. Size is read from the unsaved request file, before any save is
        // attempted. file.save() throws SSS_FILE_CONTENT_SIZE_EXCEEDED above 10 MB, which
        // tells the user nothing they can act on; naming the file and the limit tells
        // them to compress or split it. Linking does not lift this: the file still has to
        // be saved to the File Cabinet before it can be linked to.
        for (i = 0; i < uploads.length; i++) {
            totalBytes = totalBytes + usableSize(uploads[i]);

            if (isOversized(uploads[i])) {
                errors.push('"' + uploads[i].name + '" is ' +
                    describeSize(uploads[i].size) + ', which is over the ' +
                    describeSize(config.MAX_ATTACHMENT_BYTES) + ' limit for a single ' +
                    'file. This limit applies however the document is sent, because the ' +
                    'file has to be saved before it can be linked to. Please compress it ' +
                    'or split it, then try again. Nothing has been saved or sent.');
            }
        }

        // ONLY WHEN ATTACHING. A link-only send puts nothing in the message, so the
        // 15 MB message ceiling does not apply to it - which is the whole point of
        // Phase 2. The message says why the limit is in play, so the user can see that
        // clearing the checkbox is the fix.
        if (submitted.attachToo && totalBytes > config.MAX_MESSAGE_BYTES) {
            errors.push('These documents total ' + describeSize(totalBytes) +
                ', which is over the ' + describeSize(config.MAX_MESSAGE_BYTES) +
                ' limit for one email. That limit applies because you ticked ' +
                '"Also attach the files to the email". Untick it to send them as ' +
                'links only, which has no total size limit, or send them across ' +
                'several emails. Nothing has been saved or sent.');
        }

        return errors;
    }

    /**
     * A size that can be added up. Unreadable sizes count as zero rather than failing
     * the total: the per-file check already treats an unreadable size as acceptable, and
     * the two must agree or a file could pass one check and fail the other for the same
     * unknown value.
     */
    function usableSize(upload) {
        var size = Number(upload.size);
        return (isFinite(size) && size > 0) ? size : 0;
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
     * FILE NAME COLLISIONS: two Opportunities will both send "Drawing1.pdf". Every saved
     * name is therefore prefixed with the Opportunity's tranid and a timestamp:
     *
     *     <tranid>_<YYYYMMDD-HHMMSSmmm>_<n>_<original name>
     *
     * The tranid scopes it to the Opportunity, the timestamp separates one send from the
     * next (including a resend of the same drawing after a redraw), and the index
     * separates files within a single send that happen to share a name.
     *
     * WHY THE TIMESTAMP CARRIES MILLISECONDS. Saving a file whose name already exists in
     * the folder OVERWRITES the existing file rather than failing. With second
     * granularity, two sends from the same Opportunity inside one second - a
     * double-submit, or two people working the same job - would silently replace the
     * first send's file, and every link already in the first customer's inbox would
     * start serving the second customer's drawing. Milliseconds close that window.
     *
     * This is now load-bearing for Phase 2 in a way it was not for Phase 1: a link is a
     * promise that stays live in someone's mailbox, so what it points at must never
     * change underneath them.
     */
    function saveUploads(uploads, tranId) {
        var saved = [];
        var stamp = buildTimestamp(new Date());
        var folderId = config.getAttachmentFolder();
        var i;
        var upload;
        var fileObj;
        var savedName;
        var fileId;
        var published;

        for (i = 0; i < uploads.length; i++) {
            upload = uploads[i];
            fileObj = upload.fileObj;

            savedName = ensureNameIsFree(
                buildSavedFileName(tranId, stamp, upload.position, upload.name),
                folderId);

            fileObj.name = savedName;
            fileObj.folder = folderId;

            // Publish. The documentation reachable here says isOnline may be set on the
            // file object before save(); publishAndLoad below re-checks after the save
            // and corrects it if that turns out not to hold, so this is right either way.
            fileObj.isOnline = true;

            fileId = fileObj.save();

            published = publishAndLoad(fileId, savedName);

            // Logged at audit WITH the URL, so a customer reporting a dead link can be
            // traced to the exact file that was sent without guessing which send it came
            // from or reconstructing the URL by hand.
            log.audit('dsn_sl_send_design.saveUploads',
                'Saved "' + upload.name + '" as "' + savedName + '" (file ' + fileId +
                ') | label: "' + upload.label + '" | url: ' +
                (published.url || '(NO URL RESOLVED)'));

            saved.push({
                id:           fileId,
                savedName:    savedName,
                originalName: upload.name,
                size:         upload.size,
                label:        upload.label,
                url:          published.url,
                fileObj:      published.fileObj
            });
        }

        return saved;
    }

    /**
     * Loads a just-saved file back and returns it with its public URL.
     *
     * Reloading is not optional: File.url depends on the file's internal ID and its
     * generated hash, neither of which exists until the save has happened.
     *
     * The isOnline re-check exists because the documentation could not settle whether
     * setting isOnline before save() is sufficient (see docs/phase-2-links.md). If the
     * reloaded file reports isOnline false, it is set and saved again. Under the
     * documented reading this branch never runs; if the documented reading is wrong, the
     * link still works. Either way the outcome is logged, so which one is true becomes
     * visible in the execution log rather than staying a guess.
     */
    function publishAndLoad(fileId, savedName) {
        var fileObj = file.load({ id: fileId });

        if (fileObj.isOnline !== true) {
            log.audit('dsn_sl_send_design.publishAndLoad',
                '"' + savedName + '" was not online after save; setting isOnline on the ' +
                'saved file and re-saving. Setting isOnline before save() is evidently ' +
                'not sufficient in this account.');
            try {
                fileObj.isOnline = true;
                fileObj.save();
                fileObj = file.load({ id: fileId });
            } catch (e) {
                log.error('dsn_sl_send_design.publishAndLoad',
                    'Could not publish "' + savedName + '" (file ' + fileId + '): ' +
                    e.message + ' - its link will require a NetSuite login.');
            }
        }

        return {
            fileObj: fileObj,
            url:     config.buildPublicFileUrl(fileObj.url)
        };
    }

    /**
     * The documents passed to the template, in the order their slots appear on the form,
     * which is the order the buttons appear in the email.
     */
    function buildDocumentList(savedFiles) {
        var documents = [];
        var i;
        for (i = 0; i < savedFiles.length; i++) {
            documents.push({
                label: savedFiles[i].label,
                url:   savedFiles[i].url
            });
        }
        return documents;
    }

    function collectAttachments(savedFiles) {
        var attachments = [];
        var i;
        for (i = 0; i < savedFiles.length; i++) {
            attachments.push(savedFiles[i].fileObj);
        }
        return attachments;
    }

    /**
     * Returns a name that no file in the folder currently holds, appending _2, _3 and so
     * on until one is free.
     *
     * This exists because **saving over an existing name silently replaces that file**.
     * The timestamp makes a clash vanishingly unlikely, but "unlikely" is the wrong
     * standard here: a link lives in a customer's mailbox indefinitely, and a clash would
     * not fail loudly - it would quietly re-point an already-delivered link at somebody
     * else's drawing. A check that costs one search per file is worth that.
     *
     * A failed search returns the name unchanged rather than blocking the send. That is
     * the lesser risk: the clash it guards against needs two sends inside the same
     * millisecond, whereas refusing on a search error would block an ordinary send.
     */
    function ensureNameIsFree(preferredName, folderId) {
        var MAX_ATTEMPTS = 50;
        var candidate = preferredName;
        var dotAt;
        var base;
        var extension;
        var attempt = 1;

        dotAt = preferredName.lastIndexOf('.');
        base = dotAt > 0 ? preferredName.substring(0, dotAt) : preferredName;
        extension = dotAt > 0 ? preferredName.substring(dotAt) : '';

        try {
            while (attempt <= MAX_ATTEMPTS && nameExistsInFolder(candidate, folderId)) {
                attempt = attempt + 1;
                candidate = base + '_' + attempt + extension;
            }
        } catch (e) {
            log.error('dsn_sl_send_design.ensureNameIsFree',
                'Could not check whether "' + preferredName + '" is already used in ' +
                'folder ' + folderId + ': ' + e.message + ' - saving under the preferred ' +
                'name.');
            return preferredName;
        }

        if (candidate !== preferredName) {
            log.audit('dsn_sl_send_design.ensureNameIsFree',
                '"' + preferredName + '" was already in folder ' + folderId +
                '; saving as "' + candidate + '" instead so the existing file, and any ' +
                'link already sent to a customer, are left untouched.');
        }

        return candidate;
    }

    function nameExistsInFolder(name, folderId) {
        var found = false;

        search.create({
            type: 'file',
            filters: [
                ['name', 'is', name], 'AND',
                ['folder', 'anyof', folderId]
            ],
            columns: ['internalid']
        }).run().each(function () {
            found = true;
            return false;
        });

        return found;
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
            pad2(date.getSeconds()) +
            pad3(date.getMilliseconds());
    }

    function pad2(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function pad3(value) {
        if (value < 10) { return '00' + value; }
        if (value < 100) { return '0' + value; }
        return String(value);
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

        html.push('<h3>Documents sent</h3>');
        html.push('<p style="margin:0 0 8px 0;">' +
            (submitted.attachToo
                ? 'Sent as links <strong>and</strong> as attachments.'
                : 'Sent as links only. Nothing was attached to the message.') +
            '</p>');
        html.push('<p style="margin:0 0 8px 0;">Please click a link below to check it ' +
            'opens before the customer does.</p>');
        html.push('<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;">');
        html.push('<tr style="background:#eee;"><th>Button label</th><th>Link</th>' +
            '<th>Original name</th><th>Saved as</th><th>Size</th></tr>');
        for (i = 0; i < savedFiles.length; i++) {
            html.push('<tr><td>' + config.escapeHtml(savedFiles[i].label) + '</td>' +
                '<td>' + buildLinkCell(savedFiles[i].url) + '</td>' +
                '<td>' + config.escapeHtml(savedFiles[i].originalName) + '</td>' +
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

    /**
     * The link cell on the success page: clickable, and showing the URL in full so it can
     * be copied or eyeballed. A document with no resolvable URL says so loudly - the
     * email has already gone, so the sender needs to know a button in it is dead.
     */
    function buildLinkCell(publicUrl) {
        var safe;
        if (!publicUrl) {
            return '<strong style="color:#c00;">No link could be built for this ' +
                   'document. Its button in the email will not work - please check the ' +
                   'execution log.</strong>';
        }
        safe = config.escapeHtml(publicUrl);
        return '<a href="' + safe + '" target="_blank">' + safe + '</a>';
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
