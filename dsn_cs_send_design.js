/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @name        Design Send - Send Design Suitelet Client Script
 * @description Client script for the Send Design Suitelet form. Two jobs: fill the To
 *              field when a contact is chosen, and return to the Opportunity when
 *              Cancel is pressed.
 * @version     1.0.0
 *
 * NO SCRIPT RECORD.
 *   Attached to the form by dsn_sl_send_design.js via form.clientScriptModulePath, and
 *   never deployed in its own right, so it has no script ID and no deployment ID.
 *
 * NOT ADDED TO THE BRIEF'S FILE LIST BY OVERSIGHT - see docs/phase-0-recon.md.
 *   Two required behaviours cannot be built without a client script on this form: a
 *   Cancel button's functionName must resolve against one, and "selecting a contact
 *   populates To" is client-side by definition. The alternative - an inline <script>
 *   writing to the DOM - is the pattern this project rejected for Send Quote.
 *
 * PHASE 2
 *   Also pre-fills each document's button label from its chosen category. The user may
 *   then edit it freely; the server falls back to the category name if they clear it.
 *
 * THIS SCRIPT DOES NOT VALIDATE.
 *   Every check runs server-side on POST, against what was actually submitted. Nothing
 *   here can be bypassed to reach email.send, because nothing here is what guards it.
 */

define(['N/currentRecord', 'N/url', 'N/log'],
function (currentRecord, url, log) {

    'use strict';

    var SCRIPT_VERSION = '1.1.0';

    var FLD = {
        OPPORTUNITY_ID: 'custpage_dsn_opportunity_id',
        CONTACT:        'custpage_dsn_contact',
        CONTACT_MAP:     'custpage_dsn_contact_map',
        TO:              'custpage_dsn_to',
        CATEGORY_PREFIX: 'custpage_dsn_category_',
        LABEL_PREFIX:    'custpage_dsn_label_'
    };

    /** Must match config.ATTACHMENT_FIELD_COUNT on the server. */
    var ATTACHMENT_FIELD_COUNT = 5;

    function pageInit(context) {
        log.debug('dsn_cs_send_design.pageInit',
            'Send Design Suitelet client script loaded (v' + SCRIPT_VERSION + ').');
    }

    /**
     * Fills the To field from the chosen contact.
     *
     * The dropdown is keyed on the contact's internal ID, so the address is looked up
     * from the map the Suitelet rendered. A contact with no email recorded leaves To
     * exactly as it was - it is never cleared, and never filled with an empty string.
     */
    function fieldChanged(context) {
        var rec;
        var contactId;
        var emailsByContactId;
        var address;

        if (isCategoryField(context.fieldId)) {
            fillLabelFromCategory(context.currentRecord, context.fieldId);
            return;
        }

        if (context.fieldId !== FLD.CONTACT) { return; }

        try {
            rec = context.currentRecord;
            contactId = rec.getValue({ fieldId: FLD.CONTACT });

            if (!contactId) { return; }

            emailsByContactId = parseContactMap(rec.getValue({ fieldId: FLD.CONTACT_MAP }));
            address = emailsByContactId[contactId];

            if (!address) {
                log.debug('dsn_cs_send_design.fieldChanged',
                    'Contact ' + contactId + ' has no email recorded. The To field has ' +
                    'been left unchanged.');
                return;
            }

            rec.setValue({ fieldId: FLD.TO, value: address });

        } catch (e) {
            log.error('dsn_cs_send_design.fieldChanged',
                'Could not fill To from the selected contact: ' + e.message);
        }
    }

    function isCategoryField(fieldId) {
        var i;
        for (i = 1; i <= ATTACHMENT_FIELD_COUNT; i++) {
            if (fieldId === FLD.CATEGORY_PREFIX + i) { return true; }
        }
        return false;
    }

    /**
     * Pre-fills a document's button label from the category just chosen.
     *
     * The label is then the user's to edit freely - "Design drawings for Flat 1",
     * "Useful information: plant room". One editable field rather than a category plus a
     * separate suffix, so there are no joining rules and no ambiguity about what the
     * customer ends up seeing on the button.
     *
     * The category's DISPLAY TEXT is used, not its internal ID. getText is what returns
     * it; getValue would put a number on the button.
     *
     * An existing label is overwritten, because changing the category is a deliberate
     * act and the old label would usually now be wrong. Clearing the category leaves the
     * label alone - the user may have typed something they want to keep, and the server
     * falls back to the category name only when the label is empty.
     */
    function fillLabelFromCategory(rec, categoryFieldId) {
        var position = categoryFieldId.substring(FLD.CATEGORY_PREFIX.length);
        var categoryText;

        try {
            categoryText = rec.getText({ fieldId: categoryFieldId });

            if (!categoryText) { return; }

            rec.setValue({
                fieldId: FLD.LABEL_PREFIX + position,
                value:   categoryText
            });

        } catch (e) {
            log.error('dsn_cs_send_design.fillLabelFromCategory',
                'Could not pre-fill the label for document ' + position + ': ' + e.message +
                ' - the user can still type one, and the server falls back to the ' +
                'category name.');
        }
    }

    function parseContactMap(raw) {
        if (!raw) { return {}; }
        try {
            return JSON.parse(raw) || {};
        } catch (e) {
            log.error('dsn_cs_send_design.parseContactMap',
                'Could not parse the contact email map: ' + e.message);
            return {};
        }
    }

    /**
     * Cancel, and "Back to Opportunity" on the result pages.
     */
    function dsnCancel() {
        var rec;
        var opportunityId;

        try {
            rec = currentRecord.get();
            opportunityId = rec.getValue({ fieldId: FLD.OPPORTUNITY_ID });

            if (opportunityId) {
                window.location.href = url.resolveRecord({
                    recordType: 'opportunity',
                    recordId:   opportunityId,
                    isEditMode: false
                });
                return;
            }
            history.back();

        } catch (e) {
            log.error('dsn_cs_send_design.dsnCancel', 'Error: ' + e.message);
            history.back();
        }
    }

    if (typeof window !== 'undefined') {
        window.dsnCancel = dsnCancel;
    }

    return {
        pageInit:     pageInit,
        fieldChanged: fieldChanged,
        dsnCancel:    dsnCancel
    };

});
