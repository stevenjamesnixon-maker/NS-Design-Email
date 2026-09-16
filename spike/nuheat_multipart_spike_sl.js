/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @name        Multipart Upload Spike
 * @description THROWAWAY. Answers one question: when a Suitelet form carries several
 *              FILE fields and the user submits, do all of them arrive in
 *              context.request.files, or only one?
 *
 *              Renders three FILE fields. On POST, reports the full shape of
 *              context.request.files - which keys are present, which expected fields
 *              are absent, and the name and size of each file that did arrive - both
 *              on the page and in the execution log.
 *
 *              Delete this script and its deployment once the question is answered.
 *              NOT FOR PRODUCTION. See spike/README.md.
 *
 * @version     1.0.0
 *
 * Script ID:      customscript_nuheat_multipart_spike_sl
 * Deployment ID:  customdeploy_nuheat_multipart_spike_sl
 */

define(['N/ui/serverWidget', 'N/log'],
function (serverWidget, log) {

    'use strict';

    var SCRIPT_VERSION = '1.0.0';

    /**
     * The FILE fields the form renders. Absence of one of these in request.files is
     * itself a finding, so they are listed explicitly rather than discovered.
     */
    var EXPECTED_FIELDS = [
        'custpage_spike_file_1',
        'custpage_spike_file_2',
        'custpage_spike_file_3'
    ];

    function onRequest(context) {
        if (context.request.method === 'GET') {
            showForm(context);
        } else {
            showResults(context);
        }
    }

    // --- GET -----------------------------------------------------------------

    function showForm(context) {
        var form = serverWidget.createForm({
            title: 'Multipart Upload Spike (throwaway - not for Production)'
        });

        var intro = form.addField({
            id:    'custpage_spike_intro',
            type:  serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        intro.defaultValue =
            '<div style="padding:12px; border:1px solid #ccc; background:#fffbe6; margin-bottom:12px;">' +
                '<strong>What this is for.</strong> Attach a file to <em>each</em> of the three ' +
                'fields below and submit. The next page reports exactly which fields arrived in ' +
                '<code>context.request.files</code>.' +
                '<br><br>' +
                'Worth running twice: once with all three filled, and once with only the first ' +
                'and third filled, so the report can be checked against what was actually sent.' +
                '<br><br>' +
                'Small files are fine - a few KB each is enough. This tells us nothing about size ' +
                'limits, only about how many files survive one POST.' +
            '</div>';

        var i;
        for (i = 0; i < EXPECTED_FIELDS.length; i++) {
            form.addField({
                id:    EXPECTED_FIELDS[i],
                type:  serverWidget.FieldType.FILE,
                label: 'File ' + (i + 1)
            });
        }

        form.addSubmitButton({ label: 'Submit' });

        context.response.writePage(form);
    }

    // --- POST ----------------------------------------------------------------

    function showResults(context) {
        var files = context.request.files || {};

        var presentKeys = collectKeys(files);
        var rows        = [];
        var i;

        // Every expected field is reported, present or not. "Field 3 absent" is the
        // finding; silence would not be.
        for (i = 0; i < EXPECTED_FIELDS.length; i++) {
            rows.push(describeField(EXPECTED_FIELDS[i], files));
        }

        // Anything that arrived under a key we did not render is worth seeing too.
        for (i = 0; i < presentKeys.length; i++) {
            if (indexOf(EXPECTED_FIELDS, presentKeys[i]) === -1) {
                rows.push(describeField(presentKeys[i], files, 'UNEXPECTED KEY'));
            }
        }

        var summary = presentKeys.length + ' of ' + EXPECTED_FIELDS.length +
            ' expected field(s) arrived in request.files. Keys present: ' +
            (presentKeys.length ? presentKeys.join(', ') : '(none)');

        // Logged as audit so it survives in the execution log at default logging levels.
        log.audit('MultipartSpike.result', summary);
        for (i = 0; i < rows.length; i++) {
            log.audit('MultipartSpike.field', rows[i].logLine);
        }

        renderReport(context, summary, rows);
    }

    /**
     * Builds the report row for one field id, whether or not it is present.
     * Every property read is guarded: on an unsaved request file, a property that
     * is not populated may throw rather than return empty, and that is itself
     * worth reporting rather than failing the page.
     */
    function describeField(fieldId, files, noteOverride) {
        var fileObj = files[fieldId];

        if (!fileObj) {
            return {
                fieldId: fieldId,
                present: false,
                name:    '-',
                size:    '-',
                type:    '-',
                note:    noteOverride || 'ABSENT - no entry under this key',
                logLine: fieldId + ' | ABSENT'
            };
        }

        var name = readProperty(fileObj, 'name');
        var size = readProperty(fileObj, 'size');
        var type = readProperty(fileObj, 'fileType');

        return {
            fieldId: fieldId,
            present: true,
            name:    name,
            size:    size,
            type:    type,
            note:    noteOverride || 'present',
            logLine: fieldId + ' | PRESENT | name: ' + name + ' | size: ' + size +
                     ' | fileType: ' + type
        };
    }

    function readProperty(fileObj, propertyName) {
        try {
            var value = fileObj[propertyName];
            if (value === undefined || value === null || value === '') {
                return '(empty)';
            }
            return String(value);
        } catch (e) {
            return '(threw: ' + e.message + ')';
        }
    }

    function collectKeys(files) {
        var keys = [];
        var k;
        for (k in files) {
            if (Object.prototype.hasOwnProperty.call(files, k)) {
                keys.push(k);
            }
        }
        return keys;
    }

    function indexOf(arr, value) {
        var i;
        for (i = 0; i < arr.length; i++) {
            if (arr[i] === value) { return i; }
        }
        return -1;
    }

    function renderReport(context, summary, rows) {
        var form = serverWidget.createForm({ title: 'Multipart Upload Spike - result' });

        var html = [];
        html.push('<div style="padding:12px; border:2px solid #333; margin-bottom:12px;">');
        html.push('<h2 style="margin:0 0 8px 0;">' + escapeHtml(summary) + '</h2>');
        html.push('<p style="margin:0;">Script version ' + SCRIPT_VERSION +
                  '. The same detail is in the execution log at audit level.</p>');
        html.push('</div>');

        html.push('<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">');
        html.push('<tr style="background:#eee;">' +
            '<th>Field ID</th><th>Present</th><th>File name</th>' +
            '<th>size</th><th>fileType</th><th>Note</th></tr>');

        var i;
        for (i = 0; i < rows.length; i++) {
            html.push('<tr>' +
                '<td><code>' + escapeHtml(rows[i].fieldId) + '</code></td>' +
                '<td><strong>' + (rows[i].present ? 'YES' : 'NO') + '</strong></td>' +
                '<td>' + escapeHtml(rows[i].name) + '</td>' +
                '<td>' + escapeHtml(rows[i].size) + '</td>' +
                '<td>' + escapeHtml(rows[i].type) + '</td>' +
                '<td>' + escapeHtml(rows[i].note) + '</td>' +
            '</tr>');
        }
        html.push('</table>');

        html.push('<p style="margin-top:16px;">' +
            'If every field reads YES, several FILE fields survive one POST and Phase 1 can ' +
            'use them directly. If only one reads YES, they do not, and Phase 1 needs the ' +
            'base64 fallback instead. Either way, please send this page back and then delete ' +
            'the script and its deployment.</p>');

        var resultField = form.addField({
            id:    'custpage_spike_result',
            type:  serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        resultField.defaultValue = html.join('');

        context.response.writePage(form);
    }

    function escapeHtml(str) {
        return String(str === undefined || str === null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return {
        onRequest: onRequest
    };

});
