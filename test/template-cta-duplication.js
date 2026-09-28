/**
 * Regression test for template 1.4.1 - duplicated CTA buttons.
 *
 * Run with:  node test/template-cta-duplication.js
 * Exits non-zero on any failure.
 *
 * WHY THIS EXISTS
 *   Every document button, and the READ NOW button, rendered twice in clients that strip
 *   inline styles - including NetSuite's own message view (crmmessage.nl). The Outlook
 *   fallback half of each button was hidden from other clients only by
 *   <div style="display:none; mso-hide: none;">. 1.4.1 wraps it in a downlevel-hidden
 *   <!--[if mso]> ... <![endif]--> conditional comment instead.
 *
 *   Tests 1 and 2 below FAIL on the 1.4.0 markup and pass on 1.4.1.
 *
 * NO TEST RUNNER
 *   This is the first committed test in the repository. It follows the style used
 *   throughout development: stub `define` and the NetSuite modules, load the module under
 *   test, assert with ok(). No dependencies, no framework.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

var pass = 0;
var fail = 0;

function ok(name, condition, detail) {
    if (condition) {
        pass = pass + 1;
        console.log('  PASS  ' + name);
    } else {
        fail = fail + 1;
        console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
    }
}

// --- load the module under test, with the real escapeHtml from the config library ------

function loadAmd(relativePath, deps) {
    var module;
    global.define = function (dependencyNames, factory) {
        module = factory.apply(null, dependencyNames.map(function (name) {
            return deps[name];
        }));
    };
    /* eslint-disable no-eval */
    eval(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
    /* eslint-enable no-eval */
    return module;
}

var log = { debug: function () {}, audit: function () {}, error: function () {} };
var runtime = {
    getCurrentScript: function () { return { getParameter: function () { return ''; } }; },
    getCurrentUser: function () { return { id: '1' }; }
};
var url = {
    resolveDomain: function () { return 'example.app.netsuite.com'; },
    HostType: { APPLICATION: 'APPLICATION' }
};

var config = loadAmd('lib/dsn_lib_config.js', {
    'N/runtime': runtime, 'N/url': url, 'N/log': log
});
var template = loadAmd('dsn_email_template.js', { './lib/dsn_lib_config': config });

// --- client simulations ---------------------------------------------------------------

/**
 * What a non-Outlook client renders.
 *
 * Parses comments the way a browser does rather than matching named blocks: scan for
 * "<!--" and drop everything through the next "-->". That is faithful to both conditional
 * forms at once -
 *
 *   <!--[if !mso]><!-- -->KEPT<!--<![endif]-->   the markers are comments, KEPT is markup
 *   <!--[if mso]>DROPPED<![endif]-->             the whole thing is one comment
 *
 * - and it is why a "-->" inside an [if mso] block would be a real bug: it would end the
 * comment early and spill Outlook markup into every client. Test 5 covers that.
 */
function nonOutlookView(html) {
    var out = '';
    var rest = String(html);
    var start;
    var end;

    for (;;) {
        start = rest.indexOf('<!--');
        if (start === -1) { return out + rest; }
        out = out + rest.substring(0, start);
        end = rest.indexOf('-->', start + 4);
        if (end === -1) { return out; }          // unterminated comment swallows the rest
        rest = rest.substring(end + 3);
    }
}

/** What Outlook desktop renders: revealed blocks dropped, hidden blocks unwrapped. */
function outlookView(html) {
    return String(html)
        .replace(/<!--\[if !mso\]><!-- -->[\s\S]*?<!--<!\[endif\]-->/g, '')
        .replace(/<!--\[if (?:gte )?mso[^\]]*\]>([\s\S]*?)<!\[endif\]-->/g, '$1');
}

/** The NetSuite message viewer: a non-Outlook client that also strips inline styles. */
function stripInlineStyles(html) {
    return String(html).replace(/ style="[^"]*"/g, '');
}

function countOccurrences(haystack, needle) {
    var count = 0;
    var at = String(haystack).indexOf(needle);
    while (at !== -1) {
        count = count + 1;
        at = String(haystack).indexOf(needle, at + needle.length);
    }
    return count;
}

/** The label as it appears on a rendered button. */
function countButtons(html, label) {
    return countOccurrences(html, '<strong>' + label + '</strong>');
}

// --- the body under test --------------------------------------------------------------

var DOC_A = { label: 'Design drawings', url: 'https://example.app.netsuite.com/core/media/media.nl?id=1&c=42&h=aaa' };
var DOC_B = { label: 'Plant room info', url: 'https://example.app.netsuite.com/core/media/media.nl?id=2&c=42&h=bbb' };

function build(documents) {
    return template.buildBody({
        projectRef:  'OPP1234',
        senderRole:  'Project Engineer',
        senderName:  'Dana Eng',
        senderEmail: 'design@nu-heat.co.uk',
        senderPhone: '01404 222333',
        documents:   documents,
        attachFiles: false
    });
}

var body = build([DOC_A, DOC_B]);

console.log('\nTemplate version under test: ' + template.TEMPLATE_VERSION);

console.log('\n-- 1. non-Outlook view: one button per document --');
var plain = nonOutlookView(body);
ok('"Design drawings" appears exactly once', countButtons(plain, 'Design drawings') === 1,
   'found ' + countButtons(plain, 'Design drawings'));
ok('"Plant room info" appears exactly once', countButtons(plain, 'Plant room info') === 1,
   'found ' + countButtons(plain, 'Plant room info'));

console.log('\n-- 2. non-Outlook view WITH INLINE STYLES STRIPPED (the regression) --');
var stripped = nonOutlookView(stripInlineStyles(body));
ok('"Design drawings" still appears exactly once', countButtons(stripped, 'Design drawings') === 1,
   'found ' + countButtons(stripped, 'Design drawings'));
ok('"Plant room info" still appears exactly once', countButtons(stripped, 'Plant room info') === 1,
   'found ' + countButtons(stripped, 'Plant room info'));
ok('no display:none wrapper is relied on anywhere in the body',
   body.indexOf('display:none; mso-hide: none;') === -1);

console.log('\n-- 3. Outlook view: one button per document --');
var outlook = outlookView(body);
ok('"Design drawings" appears exactly once', countButtons(outlook, 'Design drawings') === 1,
   'found ' + countButtons(outlook, 'Design drawings'));
ok('"Plant room info" appears exactly once', countButtons(outlook, 'Plant room info') === 1,
   'found ' + countButtons(outlook, 'Plant room info'));
ok('the Outlook half really is present, not just absent from the other view',
   body.indexOf('<!--[if mso]>') !== -1 && body.indexOf('<![endif]-->') !== -1);

console.log('\n-- 4. hrefs --');
var hrefA = 'https://example.app.netsuite.com/core/media/media.nl?id=1&amp;c=42&amp;h=aaa';
ok('href present once per document in the non-Outlook view',
   countOccurrences(plain, hrefA) === 1, 'found ' + countOccurrences(plain, hrefA));
ok('href present once per document in the Outlook view',
   countOccurrences(outlook, hrefA) === 1, 'found ' + countOccurrences(outlook, hrefA));
ok('"&" rendered as "&amp;" in the href, so the attribute is valid markup',
   plain.indexOf(hrefA) !== -1 && plain.indexOf('id=1&c=42') === -1);

console.log('\n-- 5. a hostile label cannot break the conditional comment --');
var NASTY = 'End --> start <!-- <b>"x"</b> & \'y\'';
var nastyBody = build([{ label: NASTY, url: DOC_A.url }, DOC_B]);
var msoBlocks = nastyBody.match(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g) || [];
ok('the label is escaped, not emitted raw', nastyBody.indexOf('End --> start <!--') === -1);
ok('"-->" survives only as "--&gt;"', nastyBody.indexOf('--&gt;') !== -1);
ok('"<!--" survives only as "&lt;!--"', nastyBody.indexOf('&lt;!--') !== -1);
// Three, not two: one per document button plus the READ NOW button in the lifted
// template, which 1.4.1 fixes the same way.
ok('three [if mso] blocks found - two documents plus READ NOW',
   msoBlocks.length === 3, 'found ' + msoBlocks.length);
ok('no [if mso] block contains a raw "-->" before its terminator',
   msoBlocks.every(function (block) {
       return countOccurrences(block, '-->') === 1;
   }));
ok('button count unchanged with a hostile label',
   countButtons(nonOutlookView(nastyBody), 'Plant room info') === 1 &&
   countButtons(nonOutlookView(stripInlineStyles(nastyBody)), 'Plant room info') === 1);
ok('the escaped label itself appears exactly once per view',
   countOccurrences(nonOutlookView(nastyBody), 'End --&gt; start &lt;!--') === 1,
   'found ' + countOccurrences(nonOutlookView(nastyBody), 'End --&gt; start &lt;!--'));

console.log('\n-- 6. zero documents --');
ok('buildDocumentLinks returns an empty string', template.buildDocumentLinks([]) === '');
ok('and so does an undefined list', template.buildDocumentLinks(undefined) === '');
ok('a body with no documents still renders', build([]).indexOf('<!doctype') !== -1 ||
   build([]).indexOf('<!DOCTYPE') !== -1 || build([]).length > 1000);

console.log('\n-- 7. the READ NOW button in the lifted template --');
ok('READ NOW is still in the rendered body (it was NOT removed with Confirm Drawings)',
   body.indexOf('<strong>READ NOW</strong>') !== -1);
ok('READ NOW appears once in the non-Outlook view', countButtons(plain, 'READ NOW') === 1,
   'found ' + countButtons(plain, 'READ NOW'));
ok('READ NOW appears once with inline styles stripped',
   countButtons(stripped, 'READ NOW') === 1, 'found ' + countButtons(stripped, 'READ NOW'));
ok('READ NOW appears once in the Outlook view', countButtons(outlook, 'READ NOW') === 1,
   'found ' + countButtons(outlook, 'READ NOW'));

console.log('\n-- untouched by this fix --');
ok('the gte mso 9 ghost tables are still present',
   countOccurrences(body, '<!--[if gte mso 9]>') > 5,
   'found ' + countOccurrences(body, '<!--[if gte mso 9]>'));
ok('the downlevel-revealed half is unchanged',
   countOccurrences(body, '<!--[if !mso]><!-- -->') === 3);
ok('no merge tag left unsubstituted', !/\{\{[A-Z_]+\}\}/.test(body));
ok('the footer and delivery line still render',
   body.indexOf('design@nu-heat.co.uk') !== -1 && body.indexOf('calling me on') !== -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
