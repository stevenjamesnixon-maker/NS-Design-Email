/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * @name        Design Send - Opportunity User Event
 * @description Adds the "Send Design" button to the Opportunity form, which opens the
 *              Send Design Suitelet in a new tab.
 * @version     1.0.0
 *
 * Script ID:      customscript_dsn_ue_opportunity
 * Deployment ID:  customdeploy_dsn_ue_opportunity
 * Applies To:     Opportunity
 * Event Types:    Before Load
 *
 * Script parameter on this record:
 *   custscript_dsn_qualifying_statuses - comma separated entitystatus internal IDs
 *                                        whose Opportunities show the button.
 *
 * WHY VIEW ONLY
 *   The Suitelet re-reads the Opportunity from the database. A user who has changed the
 *   project engineer or the value proposition without saving would otherwise get an
 *   email authored by the wrong person, with the wrong name and phone in the body, and
 *   nothing would say so. Removing EDIT removes that whole class of failure.
 *
 * WHY NO SUB-STATUS CONDITION
 *   Drawings get resent after a redraw, when a customer loses them, when a builder
 *   wants a copy months later - by which time the project has moved past Design
 *   Complete. A sub-status gate would hide the button exactly when someone most needs
 *   it, and they would fall back to the native email from the central mailbox, which is
 *   the behaviour this feature exists to remove. Nothing else is checked either: not
 *   quotes, not the sales rep, not the project engineer.
 */

define(['N/log', './lib/dsn_lib_config'],
function (log, config) {

    'use strict';

    var SCRIPT_VERSION = '1.0.0';

    var BUTTON_ID    = 'custpage_dsn_send_design';
    var BUTTON_LABEL = 'Send Design';

    /**
     * The name of the function the button invokes. NetSuite appends "()" to this
     * string and evaluates it, so it must be a function NAME exposed by the client
     * script - never a URL. A URL here fails at click time with "... is not a function".
     */
    var BUTTON_FUNCTION = 'openSendDesignSuitelet';

    function beforeLoad(context) {
        var form;
        var opportunityId;
        var status;
        var qualifyingStatuses;

        try {
            // VIEW only. See header.
            if (context.type !== context.UserEventType.VIEW) {
                return;
            }

            opportunityId = context.newRecord.id;
            status = context.newRecord.getValue({ fieldId: config.FIELD.ENTITY_STATUS });

            qualifyingStatuses = config.getQualifyingStatuses();

            if (!config.listContains(qualifyingStatuses, status)) {
                log.debug('dsn_ue_opportunity.beforeLoad',
                    'No button. Opportunity ' + opportunityId + ' has entitystatus "' +
                    status + '", which is not in the qualifying list [' +
                    qualifyingStatuses.join(', ') + '].');
                return;
            }

            form = context.form;

            // Defensive: removeButton throws when the button is not present, which is
            // the normal case on a first load.
            try {
                form.removeButton({ id: BUTTON_ID });
            } catch (removeErr) {
                // Expected - nothing to remove.
            }

            form.addButton({
                id:           BUTTON_ID,
                label:        BUTTON_LABEL,
                functionName: BUTTON_FUNCTION
            });

            // Relative to THIS script's folder in the File Cabinet, so the client
            // script must sit alongside it. It has no script record and needs none.
            form.clientScriptModulePath = './dsn_cs_opportunity.js';

            log.debug('dsn_ue_opportunity.beforeLoad',
                'Send Design button added to Opportunity ' + opportunityId +
                ' (status ' + status + ', v' + SCRIPT_VERSION + ').');

        } catch (e) {
            // Non-fatal by design: a failure here must degrade to "no button", never to
            // an Opportunity that will not open.
            log.error('dsn_ue_opportunity.beforeLoad',
                'Could not add the Send Design button: ' + e.message + '\n' + e.stack);
        }
    }

    return {
        beforeLoad: beforeLoad
    };

});
