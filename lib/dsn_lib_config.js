/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        Design Send - Configuration and Shared Helpers
 * @description Constants, script parameter accessors and the small shared helpers
 *              used by the Send Design user event, client script and Suitelet.
 * @version     1.0.0
 *
 * FOLDER LAYOUT
 *   This file must sit in a "lib" subfolder of the folder holding the four
 *   dsn_*.js scripts, because they load it as './lib/dsn_lib_config.js'.
 *   Relative module paths resolve against the requiring file's own folder.
 *
 * HELPER LINEAGE
 *   escapeHtml, parseEmails and validateEmailField originate from
 *   nuheat_send_quote_sl.js / nuheat_send_quote_cs.js (2026 Quote project) and are
 *   COPIED here, not referenced. The Send Design scripts live in their own File
 *   Cabinet folder and cannot './' import the 2026 Quote modules. The copies are
 *   this project's to maintain; changes here do not affect Send Quote, and changes
 *   there do not affect this.
 *
 * SCRIPT PARAMETERS
 *   Parameters belong to a script RECORD, so they are split across two records.
 *   Each accessor below documents which record carries it, and what an empty value
 *   is taken to mean. See "failure mode" on each accessor.
 */

define(['N/runtime', 'N/url', 'N/log'],
function (runtime, url, log) {

    'use strict';

    var LIB_VERSION = '1.3.0';

    // --- Identifiers ---------------------------------------------------------

    var SUITELET_SCRIPT_ID     = 'customscript_dsn_sl_send_design';
    var SUITELET_DEPLOYMENT_ID = 'customdeploy_dsn_sl_send_design';

    // --- Parameter names -----------------------------------------------------

    // Defined on customscript_dsn_ue_opportunity
    var PARAM_QUALIFYING_STATUSES = 'custscript_dsn_qualifying_statuses';

    // Defined on customscript_dsn_sl_send_design
    var PARAM_SALESREP_DEFAULT_PROPS = 'custscript_dsn_salesrep_default_props';
    var PARAM_ATTACHMENT_FOLDER      = 'custscript_dsn_attachment_folder';

    // --- Field identifiers ---------------------------------------------------

    var FIELD = {
        ENTITY_STATUS:     'entitystatus',
        SALES_REP:         'salesrep',
        PROJECT_ENGINEER:  'custbody_pe',
        VALUE_PROPOSITION: 'custbody_value_proposition',
        TRAN_ID:           'tranid',
        TITLE:             'title',
        ENTITY:            'entity',
        EMPLOYEE_EMAIL:    'email',
        EMPLOYEE_PHONE:    'officephone',
        EMPLOYEE_FIRST:    'firstname',
        EMPLOYEE_LAST:     'lastname'
    };

    // --- Constants -----------------------------------------------------------

    /**
     * The shared design mailbox printed in the body when the sender is the project
     * engineer. A constant here, deliberately NOT a literal inside the template
     * string, so it is changed in one place.
     */
    var SHARED_DESIGN_EMAIL = 'design@nu-heat.co.uk';

    /**
     * The Customer Support Team's number, used by the delivery-booking line when the
     * sender has no office phone. A constant here rather than a literal inside the
     * template string, for the same reason as SHARED_DESIGN_EMAIL: one place to change it.
     */
    var CUSTOMER_SUPPORT_PHONE = '01404 540748';

    var ROLE_PROJECT_ENGINEER = 'Project Engineer';
    var ROLE_ACCOUNT_MANAGER  = 'Account Manager';

    /**
     * 10 MB. file.save() throws SSS_FILE_CONTENT_SIZE_EXCEEDED above this, so each
     * uploaded file is measured before saving and refused by name if it is over.
     * The native Communication tab upload does not go through file.save() and is not
     * subject to this, so "it attaches by hand" does not mean it will attach here.
     */
    var MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

    /**
     * Ten document slots.
     *
     * Phase 2a raised this from five. There is no "add another document" button and
     * cannot be one: a Suitelet form is rendered server-side, a client script cannot add
     * a NetSuite field to a page that has already loaded, and re-submitting to re-render
     * would discard every file already chosen, because no browser can repopulate a file
     * input. Ten fixed slots is the honest form of "as many as you need".
     */
    var ATTACHMENT_FIELD_COUNT = 10;

    /**
     * 15 MB. NetSuite's ceiling on total message size including attachments.
     *
     * This applies ONLY when the user ticks "Also attach the files to the email".
     * Linking does not put the file in the message, so a link-only send is not
     * constrained by it at all - which is the point of Phase 2.
     */
    var MAX_MESSAGE_BYTES = 15 * 1024 * 1024;

    /**
     * The custom list backing the link category dropdown. Referenced by SCRIPT ID so
     * the client can add categories - "Commissioning information", whatever comes next -
     * without a code change or a deployment. That is the whole reason it is a list
     * rather than a set of constants in here.
     */
    var LINK_CATEGORY_LIST = 'customlist_dsn_link_category';

    // --- Parameter accessors -------------------------------------------------

    /**
     * Entity status internal IDs whose Opportunities show the Send Design button.
     * Record: customscript_dsn_ue_opportunity.
     *
     * FAILURE MODE: fail closed, return an empty list.
     * An empty parameter makes the script do LESS - no status qualifies, so the
     * button never appears. Nobody sends an email they should not have; at worst a
     * user reports a missing button, which is visible, reported quickly and fixed by
     * a field edit. Throwing here would be worse: this runs in beforeLoad, so a
     * throw risks interfering with viewing the record itself, which is a far larger
     * failure than a missing button.
     *
     * Logged at audit so an empty parameter is discoverable in the execution log
     * rather than presenting as "the button has vanished" with no explanation.
     *
     * @returns {Array<string>} internal IDs as strings, possibly empty
     */
    function getQualifyingStatuses() {
        var raw = getParameterValue(PARAM_QUALIFYING_STATUSES);
        var ids = parseIdList(raw);
        if (ids.length === 0) {
            log.audit('dsn_lib_config.getQualifyingStatuses',
                'Parameter ' + PARAM_QUALIFYING_STATUSES + ' is empty or unset. ' +
                'No status qualifies, so the Send Design button will not appear on any ' +
                'Opportunity. This is fail-closed behaviour, not an error.');
        }
        return ids;
    }

    /**
     * Value proposition internal IDs that default the sender to the sales rep.
     * Record: customscript_dsn_sl_send_design.
     *
     * FAILURE MODE: fail closed, return an empty list.
     * An empty parameter makes the script do LESS: no value proposition matches, so
     * the default falls through to the project engineer for every Opportunity. That
     * is a wrong DEFAULT, not a wrong send - the chosen sender is displayed on the
     * form and the user can change it before submitting. A visible, correctable
     * default does not justify blocking the feature outright.
     *
     * Logged at audit for the same reason as above.
     *
     * @returns {Array<string>} internal IDs as strings, possibly empty
     */
    function getSalesRepDefaultProps() {
        var raw = getParameterValue(PARAM_SALESREP_DEFAULT_PROPS);
        var ids = parseIdList(raw);
        if (ids.length === 0) {
            log.audit('dsn_lib_config.getSalesRepDefaultProps',
                'Parameter ' + PARAM_SALESREP_DEFAULT_PROPS + ' is empty or unset. ' +
                'No value proposition will default to the sales rep; the default falls ' +
                'through to the project engineer. The user can still override on the form.');
        }
        return ids;
    }

    /**
     * File Cabinet folder internal ID that uploaded drawings are saved into.
     * Record: customscript_dsn_sl_send_design.
     *
     * FAILURE MODE: throw.
     * An empty parameter here does not make the script do less - it removes the
     * restriction that saved drawings land in one known, controlled folder. Customer
     * drawings would either fail with a raw NetSuite error the user cannot act on, or
     * be written somewhere nobody is looking. Neither is acceptable silently, and
     * unlike the two above there is no safe reduced behaviour to fall back to:
     * the whole point of the step is that the file goes to a specific place.
     *
     * Called early - on GET as well as POST - so the failure surfaces before the user
     * has selected a sender and attached five drawings, not after.
     *
     * @returns {string} folder internal ID
     * @throws {Error} when the parameter is empty or unset
     */
    function getAttachmentFolder() {
        var raw = getParameterValue(PARAM_ATTACHMENT_FOLDER);
        if (!raw) {
            throw new Error(
                'Script parameter ' + PARAM_ATTACHMENT_FOLDER + ' is not set on ' +
                SUITELET_SCRIPT_ID + '. Uploaded drawings have no folder to be saved ' +
                'into, so Send Design cannot run. Set the parameter to the internal ID ' +
                'of the File Cabinet folder for saved drawings.');
        }
        return raw;
    }

    /**
     * Reads a parameter and trims it. Returns '' when unset, so callers test one
     * thing rather than three.
     */
    function getParameterValue(parameterName) {
        var value;
        try {
            value = runtime.getCurrentScript().getParameter({ name: parameterName });
        } catch (e) {
            // A parameter that is not defined on THIS script record throws rather
            // than returning empty. Logged loudly: it means the parameter is on the
            // wrong record, which is a deployment error, not a runtime condition.
            log.error('dsn_lib_config.getParameterValue',
                'Could not read parameter ' + parameterName + ': ' + e.message +
                ' - check it is defined on the script record that is running.');
            return '';
        }
        if (value === null || value === undefined) { return ''; }
        return String(value).trim();
    }

    // --- Public file URLs ----------------------------------------------------

    /**
     * Turns whatever File.url gives us into an absolute URL fit to put in an email.
     *
     * WHY THIS IS DEFENSIVE. The documentation reachable from this environment does not
     * state whether File.url returns a relative path or an absolute URL. Rather than bet
     * on one, this handles both: a value already carrying a scheme is returned unchanged,
     * and anything else is prefixed with the account's application domain. If the
     * documented behaviour is later confirmed either way, this function still returns
     * the right answer and needs no change.
     *
     * url.resolveDomain returns a bare host with NO scheme, so 'https://' is added here.
     *
     * The result is NOT percent-encoded. File.url is already a URL and its query string
     * is already encoded; running it through encodeURIComponent would double-encode the
     * separators and break every link. It is HTML-escaped at the point of use instead,
     * which is what an href attribute actually needs.
     *
     * @param {string} fileUrl the File.url value of a saved file
     * @returns {string} absolute URL, or '' when there is nothing to build from
     */
    function buildPublicFileUrl(fileUrl) {
        var raw = fileUrl === null || fileUrl === undefined ? '' : String(fileUrl).trim();
        var domain;

        if (!raw) { return ''; }

        if (raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0) {
            return raw;
        }

        try {
            domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
        } catch (e) {
            log.error('dsn_lib_config.buildPublicFileUrl',
                'Could not resolve the application domain: ' + e.message +
                ' - the document link cannot be built.');
            return '';
        }

        if (!domain) { return ''; }

        return 'https://' + domain + (raw.charAt(0) === '/' ? '' : '/') + raw;
    }

    // --- Shared helpers ------------------------------------------------------

    /**
     * Splits a comma separated list of internal IDs into trimmed, non-empty strings.
     * Everything is compared as a string: getValue returns list IDs as strings, and
     * a parameter is text, so no number conversion happens anywhere in this project.
     */
    function parseIdList(raw) {
        var out = [];
        var parts;
        var i;
        var piece;

        if (!raw) { return out; }

        parts = String(raw).split(',');
        for (i = 0; i < parts.length; i++) {
            piece = parts[i].trim();
            if (piece) { out.push(piece); }
        }
        return out;
    }

    /**
     * Array membership. Array.prototype.includes is not available under this
     * project's house style, and indexOf on a string-typed list is all that is needed.
     */
    function listContains(list, value) {
        var i;
        if (!list || !list.length) { return false; }
        if (value === null || value === undefined || value === '') { return false; }
        for (i = 0; i < list.length; i++) {
            if (String(list[i]) === String(value)) { return true; }
        }
        return false;
    }

    /**
     * Splits a comma separated address field into trimmed, non-empty addresses.
     * COPIED from nuheat_send_quote_sl.js (parseEmails).
     * Note it does NOT validate - validateEmailField does that, and in this project
     * both run server-side on POST so an address cannot reach email.send unchecked.
     */
    function parseEmails(emailStr) {
        var out = [];
        var parts;
        var i;
        var piece;

        if (!emailStr || !String(emailStr).trim()) { return out; }

        parts = String(emailStr).split(',');
        for (i = 0; i < parts.length; i++) {
            piece = parts[i].trim();
            if (piece.length > 0) { out.push(piece); }
        }
        return out;
    }

    /**
     * True when every address in a comma separated value is well formed. An empty
     * value passes - "no CC" is valid; callers test separately for a required field.
     * COPIED from nuheat_send_quote_cs.js (validateEmailField).
     */
    function validateEmailField(value) {
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        var emails;
        var i;
        var email;

        if (!value || !String(value).trim()) { return true; }

        emails = String(value).split(',');
        for (i = 0; i < emails.length; i++) {
            email = emails[i].trim();
            if (email && !emailRegex.test(email)) { return false; }
        }
        return true;
    }

    /**
     * COPIED from nuheat_send_quote_sl.js (escapeHtml).
     */
    function escapeHtml(str) {
        if (str === undefined || str === null) { return ''; }
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return {
        LIB_VERSION:              LIB_VERSION,
        SUITELET_SCRIPT_ID:       SUITELET_SCRIPT_ID,
        SUITELET_DEPLOYMENT_ID:   SUITELET_DEPLOYMENT_ID,
        FIELD:                    FIELD,
        SHARED_DESIGN_EMAIL:      SHARED_DESIGN_EMAIL,
        CUSTOMER_SUPPORT_PHONE:   CUSTOMER_SUPPORT_PHONE,
        ROLE_PROJECT_ENGINEER:    ROLE_PROJECT_ENGINEER,
        ROLE_ACCOUNT_MANAGER:     ROLE_ACCOUNT_MANAGER,
        MAX_ATTACHMENT_BYTES:     MAX_ATTACHMENT_BYTES,
        ATTACHMENT_FIELD_COUNT:   ATTACHMENT_FIELD_COUNT,
        MAX_MESSAGE_BYTES:        MAX_MESSAGE_BYTES,
        LINK_CATEGORY_LIST:       LINK_CATEGORY_LIST,
        buildPublicFileUrl:       buildPublicFileUrl,
        getQualifyingStatuses:    getQualifyingStatuses,
        getSalesRepDefaultProps:  getSalesRepDefaultProps,
        getAttachmentFolder:      getAttachmentFolder,
        parseIdList:              parseIdList,
        listContains:             listContains,
        parseEmails:              parseEmails,
        validateEmailField:       validateEmailField,
        escapeHtml:               escapeHtml
    };

});
