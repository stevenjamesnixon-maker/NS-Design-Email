/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * @name        Design Send - Opportunity Client Script
 * @description Handles the "Send Design" button on the Opportunity form: builds the
 *              Suitelet URL and opens it in a new tab.
 * @version     1.0.0
 *
 * NO SCRIPT RECORD.
 *   This file is attached to the form by dsn_ue_opportunity.js via
 *   form.clientScriptModulePath and is never deployed in its own right. It therefore
 *   has no script ID and no deployment ID, and this header deliberately does not claim
 *   either. (nuheat_opportunity_cs.js in the 2026 Quote project declares both despite
 *   being loaded the same way, which would send someone hunting for records that do
 *   not exist.)
 */

define(['N/url', 'N/currentRecord', 'N/log', './lib/dsn_lib_config'],
function (url, currentRecord, log, config) {

    'use strict';

    var SCRIPT_VERSION = '1.0.0';

    function pageInit(context) {
        log.debug('dsn_cs_opportunity.pageInit',
            'Send Design client script loaded (v' + SCRIPT_VERSION + ').');
    }

    /**
     * Invoked by the Send Design button. The user event passes this function's NAME as
     * the button's functionName; NetSuite resolves it against this module.
     */
    function openSendDesignSuitelet() {
        var rec;
        var opportunityId;
        var suiteletUrl;

        try {
            rec = currentRecord.get();
            opportunityId = rec.id;

            if (!opportunityId) {
                // The button is VIEW-only on a saved record, so this should be
                // unreachable. Kept because the alternative is opening a Suitelet with
                // no Opportunity to act on.
                alert('Please save the Opportunity record before sending a design.');
                return;
            }

            suiteletUrl = url.resolveScript({
                scriptId:          config.SUITELET_SCRIPT_ID,
                deploymentId:      config.SUITELET_DEPLOYMENT_ID,
                returnExternalUrl: false,
                params: {
                    opportunityId: opportunityId
                }
            });

            log.debug('dsn_cs_opportunity.openSendDesignSuitelet',
                'Opening Send Design for Opportunity ' + opportunityId + '.');

            window.open(suiteletUrl, '_blank');

        } catch (e) {
            log.error('dsn_cs_opportunity.openSendDesignSuitelet', 'Error: ' + e.message);
            alert('Could not open the Send Design page. Error: ' + e.message);
        }
    }

    // Returning the function is what NetSuite resolves the button's functionName
    // against. The window assignment is belt-and-braces, matching the 2026 Quote
    // precedent, and costs nothing.
    if (typeof window !== 'undefined') {
        window.openSendDesignSuitelet = openSendDesignSuitelet;
    }

    return {
        pageInit:                pageInit,
        openSendDesignSuitelet:  openSendDesignSuitelet
    };

});
