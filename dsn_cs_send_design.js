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
 * THIS SCRIPT DOES NOT VALIDATE.
 *   Every check runs server-side on POST, against what was actually submitted. Nothing
 *   here can be bypassed to reach email.send, because nothing here is what guards it.
 */

define(['N/currentRecord', 'N/url', 'N/log'],
function (currentRecord, url, log) {

    'use strict';

    var SCRIPT_VERSION = '1.0.0';

    var FLD = {
        OPPORTUNITY_ID: 'custpage_dsn_opportunity_id',
        CONTACT:        'custpage_dsn_contact',
        CONTACT_MAP:    'custpage_dsn_contact_map',
        TO:             'custpage_dsn_to'
    };

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
