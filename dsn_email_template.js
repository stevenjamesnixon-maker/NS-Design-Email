/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        Design Send - Email Template
 * @description The installation-drawings email body, lifted from NetSuite email
 *              template 3334 and rendered here with merge tags this project
 *              substitutes itself.
 * @version     1.0.0
 *
 * WHY THE HTML LIVES IN A SCRIPT
 *   Template 3334 cannot be used as a NetSuite template because its merge fields
 *   bind to the CAD Worklist custom record, which is being retired:
 *     ${customrecord.custrecord_cad_opportunity}  -> {{PROJECT_REF}} in body text,
 *                                                    {{PROJECT_REF_URL}} inside the two
 *                                                    CONFIRM DRAWINGS mailto subjects
 *     ${customrecord.custrecord_cad_proj_eng}     -> {{SENDER_NAME}}
 *     ${customrecord.custrecord_pe_phone}         -> {{SENDER_PHONE}}
 *   The markup is otherwise byte-for-byte the template's own, generated from
 *   reference/E.PE-UFH_Installation drawings ready--2024-3-12 16_31_14.html.
 *
 *   ACCEPTED TRADE-OFF, recorded deliberately: marketing can no longer edit this
 *   email without a code change. See docs/phase-0-recon.md, Decisions.
 *
 * TWO FURTHER CHANGES TO THE LIFTED MARKUP
 *   1. The footer sentence hard-coded the role "Project Engineer" and the address
 *      design@nu-heat.co.uk. Both are now tags: the role varies with the sender, and
 *      the address comes from the config library rather than a literal in this string.
 *   2. Nothing else. The CONFIRM DRAWINGS button still points at
 *      customer.support@nu-heat.co.uk and still carries {{PROJECT_REF}} in its subject.
 *
 * PHASE 2 TAGS
 *   {{INTRO_COPY}}      replaces the fixed sentence "Please find your bespoke
 *                       installation drawings attached", which stops being true once
 *                       nothing is attached. Two variants, selected by options.attachFiles.
 *   {{DOCUMENT_LINKS}}  one branded CTA button per document, labelled by the user.
 *
 * THE PHONE CLAUSE
 *   When the sender has no officephone the phrase " or {{SENDER_PHONE}}" is removed
 *   from the sentence before substitution, leaving
 *     "contact your Project Engineer, NAME, via design@nu-heat.co.uk."
 *   which reads correctly. A blank phone is never filled with a switchboard number
 *   and the name is never replaced with a branded fallback: both would be actively
 *   wrong for a project engineer.
 */

define(['./lib/dsn_lib_config'],
function (config) {

    'use strict';

    var TEMPLATE_VERSION = '1.1.0';

    /**
     * The phrase removed wholesale when the sender has no phone. Must match the
     * template markup exactly, so it is asserted at build time by buildBody().
     */
    var PHONE_CLAUSE = ' or {{SENDER_PHONE}}';

    /**
     * Template 3334's markup, with {{TAG}} placeholders. One array entry per source
     * line; joined with newlines so the rendered HTML matches the original layout.
     */
    var TEMPLATE_LINES = [
        '<!DOCTYPE html>',
        '<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">',
        '<head>',
        '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
        '<meta name="x-apple-disable-message-reformatting">',
        '<meta name="format-detection" content="telephone=no">',
        '<title>Your installation drawings</title>',
        '',
        '<!--##custom-font-resource##-->',
        '<!--[if gte mso 16]>',
        '<xml>',
        '<o:OfficeDocumentSettings>',
        '<o:AllowPNG/>',
        '<o:PixelsPerInch>96</o:PixelsPerInch>',
        '</o:OfficeDocumentSettings>',
        '</xml>',
        '<![endif]-->',
        '<style>',
        'html,body,table,tbody,tr,td,div,p,ul,ol,li,h1,h2,h3,h4,h5,h6 {',
        'margin: 0;',
        'padding: 0;',
        '}',
        '',
        'body {',
        '-ms-text-size-adjust: 100%;',
        '-webkit-text-size-adjust: 100%;',
        '}',
        '',
        'table {',
        'border-spacing: 0;',
        'mso-table-lspace: 0pt;',
        'mso-table-rspace: 0pt;',
        '}',
        '',
        'table td {',
        'border-collapse: collapse;',
        '}',
        '',
        'h1,h2,h3,h4,h5,h6 {',
        'font-family: Arial;',
        '}',
        '',
        '.ExternalClass {',
        'width: 100%;',
        '}',
        '',
        '.ExternalClass,',
        '.ExternalClass p,',
        '.ExternalClass span,',
        '.ExternalClass font,',
        '.ExternalClass td,',
        '.ExternalClass div {',
        'line-height: 100%;',
        '}',
        '',
        '/* Outermost container in Outlook.com */',
        '.ReadMsgBody {',
        'width: 100%;',
        '}',
        '',
        'img {',
        '-ms-interpolation-mode: bicubic;',
        '}',
        '',
        '</style>',
        '',
        '<style>',
        'a[x-apple-data-detectors=true]{',
        'color: inherit !important;',
        'text-decoration: inherit !important;',
        '}',
        '',
        'u + #body a {',
        'color: inherit;',
        'text-decoration: inherit !important;',
        'font-size: inherit;',
        'font-family: inherit;',
        'font-weight: inherit;',
        'line-height: inherit;',
        '}',
        '',
        'a, a:link, .no-detect-local a, .appleLinks a {',
        'color: inherit !important;',
        'text-decoration: inherit;',
        '}',
        '</style>',
        '',
        '<style>',
        '',
        '.width600 {',
        'width: 600px;',
        'max-width: 100%;',
        '}',
        '',
        '@media all and (max-width: 599px) {',
        '.width600 {',
        'width: 100% !important;',
        '}',
        '}',
        '',
        '@media screen and (min-width: 600px) {',
        '.hide-on-desktop {',
        'display: none !important;',
        '}',
        '}',
        '',
        '@media all and (max-width: 599px),',
        'only screen and (max-device-width: 599px) {',
        '.main-container {',
        'width: 100% !important;',
        '}',
        '',
        '.col {',
        'width: 100%;',
        '}',
        '',
        '.fluid-on-mobile {',
        'width: 100% !important;',
        'height: auto !important;',
        'text-align:center;',
        '}',
        '',
        '.fluid-on-mobile img {',
        'width: 100% !important;',
        '}',
        '',
        '.hide-on-mobile {',
        'display:none !important;',
        'width:0px !important;',
        'height:0px !important;',
        'overflow:hidden;',
        '}',
        '}',
        '',
        '</style>',
        '',
        '<!--[if gte mso 9]>',
        '<style>',
        '',
        '.col {',
        'width: 100%;',
        '}',
        '',
        '.width600 {',
        'width: 600px;',
        '}',
        '',
        '.width157 {',
        'width: 157px;',
        'height: auto;',
        '}',
        '.width600 {',
        'width: 600px;',
        'height: auto;',
        '}',
        '.width144 {',
        'width: 144px;',
        'height: auto;',
        '}',
        '.width220 {',
        'width: 220px;',
        'height: auto;',
        '}',
        '.width167 {',
        'width: 167px;',
        'height: auto;',
        '}',
        '.width22 {',
        'width: 22px;',
        'height: auto;',
        '}',
        '',
        '.hide-on-desktop {',
        'display: none;',
        '}',
        '',
        '.hide-on-desktop table {',
        'mso-hide: all;',
        '}',
        '',
        '.hide-on-desktop div {',
        'mso-hide: all;',
        '}',
        '',
        '.nounderline { text-decoration: none; }',
        '',
        '.mso-font-fix-arial { font-family: Arial, sans-serif; }',
        '</style>',
        '<![endif]-->',
        '',
        '</head>',
        '<body id="body" leftmargin="0" marginwidth="0" topmargin="0" marginheight="0" offset="0" style="font-family:Arial, sans-serif; font-size:0px;margin:0;padding:0;background-color:#ffffff;">',
        '<span style="display:none;font-size:0px;line-height:0px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">Your bespoke drawings are ready.</span>',
        '<style>',
        '@media screen and (min-width: 600px) {',
        '.hide-on-desktop {',
        'display: none;',
        '}',
        '}',
        '@media all and (max-width: 599px) {',
        '.hide-on-mobile {',
        'display:none !important;',
        'width:0px !important;',
        'height:0px !important;',
        'overflow:hidden;',
        '}',
        '.main-container {',
        'width: 100% !important;',
        '}',
        '.col {',
        'width: 100%;',
        '}',
        '.fluid-on-mobile {',
        'width: 100% !important;',
        'height: auto !important;',
        'text-align:center;',
        '}',
        '.fluid-on-mobile img {',
        'width: 100% !important;',
        '}',
        '}',
        '</style>',
        '<div style="background-color:#ffffff;">',
        '<table height="100%" width="100%" cellpadding="0" cellspacing="0" border="0">',
        '<tr>',
        '<td valign="top" align="left">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td width="100%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td align="center" width="100%">',
        '<!--[if gte mso 9]><table width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table class="width600 main-container" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">',
        '<tr>',
        '<td width="100%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" class="mcol" style="background-color:#ffffff;">',
        '<tr>',
        '<td valign="top" style="padding:0;mso-cellspacing:0in;">',
        '<!--[if gte mso 9]><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><![endif]-->',
        '<!--[if gte mso 9]><td valign="top" style="padding:0;width:100px;"><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" width="16.666666666666668%" height="0" class="col hide-on-mobile" style="float:left;min-width:100px;height:1px;" align="left">',
        '<tr>',
        '<td valign="top" width="100%" style="line-height:1px;padding:0;font-size:0px;">&nbsp;</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:213.5px;"><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" width="35.583333333333336%" class="col hide-on-mobile" align="left" style="float:left;">',
        '<tr>',
        '<td valign="top" width="100%" style="padding:0;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td style="padding-right:10px;padding-left:10px;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:10px solid transparent;">',
        '<tr>',
        '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:73px;"><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" width="12.166666666666666%" height="0" class="col hide-on-mobile" style="float:left;min-width:73px;height:1px;" align="left">',
        '<tr>',
        '<td valign="top" width="100%" style="line-height:1px;padding:0;font-size:0px;">&nbsp;</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:213.5px;"><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" width="35.583333333333336%" class="col" align="left" style="float:left;">',
        '<tr>',
        '<td valign="top" width="100%" style="padding:0;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center"><!--[if gte mso 9]><table width="177" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center" style="padding:10px;"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1698400306920_Nu-Heat%20Master%20logo%20green%20-%20transparent%20v3.png" width="157" height="67" alt="Nu-Heat Underfloor Heating & Renewables" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width157" />',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td><![endif]-->',
        '<!--[if gte mso 9]></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#59315f" style="background-color:#59315f;">',
        '<tr>',
        '<td valign="top" style="padding:15px;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-top:10px;padding-right:10px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:35px;color:#ffffff;font-weight:normal;line-height:38px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:1px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><strong>Your installation drawings</strong></span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-top:10px;padding-right:10px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:19px;color:#ffffff;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial">Your bespoke drawings are ready.</span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-top:10px;padding-right:10px;padding-bottom:15px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:19px;color:#ffffff;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial">Project: {{PROJECT_REF}}</span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center"><!--[if gte mso 9]><table width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="fluid-on-mobile img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604488766124_Design%201.png" width="600" height="324" alt="Your design is ready!" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width600" />',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-top:20px;padding-right:10px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:19px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:left;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial">{{INTRO_COPY}}</span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '{{DOCUMENT_LINKS}}',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-right:10px;padding-left:10px;"><div><h3 style="font-family:Georgia, Times, Times New Roman, serif;font-size:15px;color:#000000;font-weight:normal;line-height:15px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:0px;text-align:left;padding:0;margin:0;">&nbsp;</h3></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-right:10px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:19px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:left;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial">You will also receive a printed copy of the drawings in your installation manual when your system is delivered.</span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-right:10px;padding-left:10px;"><div><h3 style="font-family:Georgia, Times, Times New Roman, serif;font-size:15px;color:#000000;font-weight:normal;line-height:15px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:0px;text-align:left;padding:0;margin:0;">&nbsp;</h3></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-right:10px;padding-bottom:20px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:19px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:left;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial">If you haven\'t already booked your delivery, you can confirm your slot by calling our Customer Support Team on <a href="tel:01404540748" target="_blank" style="text-decoration:underline !important;color:#59315f !important;"><font style="color:#59315f;">01404 540748</font></a>.</span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#d8d8d8" style="background-color:#d8d8d8;">',
        '<tr>',
        '<td valign="top">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-top:15px;padding-right:10px;padding-bottom:15px;padding-left:10px;"><div><h1 style="font-family:Calibri, Arial, sans-serif;font-size:31px;color:#59315f;font-weight:normal;line-height:35px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;padding:0;margin:0;"><span class="mso-font-fix-arial"><b>Confirm your design</b></span></h1></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center" style="padding-bottom:10px;"><!--[if gte mso 9]><table width="144" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center"><a href="https://www.nu-heat.co.uk/request-design-changes/" class="imglink" target="_blank">',
        '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1698665508018_Design.png" width="144" height="144" alt="Request changes" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width144" />',
        '</a>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-top:5px;padding-right:20px;padding-bottom:20px;padding-left:20px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:19px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial">If you\'re happy with your installation drawings, please let us know by clicking below.</span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center" style="padding-right:20px;padding-bottom:20px;padding-left:20px;">',
        '<!--[if !mso]><!-- -->',
        '<a href="mailto:customer.support@nu-heat.co.uk?subject=Confirmation%20of%20pre-installation%20drawings%20for%3A%20{{PROJECT_REF_URL}}&body=Hello%2C%20%0A%0AI%20would%20like%20to%20confirm%20that%20I%20am%20happy%20with%20my%20installation%20drawings.%20" style="display:inline-block; text-decoration:none;" class="fluid-on-mobile">',
        '<span>',
        '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">',
        '<tr>',
        '<td align="center" style="padding:15px;">',
        '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;">',
        '<font style="color:#3e3b39;" class="button">',
        '<span><strong>CONFIRM DRAWINGS</strong></span>',
        '</font>',
        '</span>',
        '</td>',
        '</tr>',
        '</table>',
        '</span>',
        '</a>',
        '<!--<![endif]-->',
        '<div style="display:none; mso-hide: none;">',
        '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">',
        '<tr>',
        '<td align="center" style="padding:15px;">',
        '<a href="mailto:customer.support@nu-heat.co.uk?subject=Confirmation%20of%20pre-installation%20drawings%20for%3A%20{{PROJECT_REF_URL}}&body=Hello%2C%20%0A%0AI%20would%20like%20to%20confirm%20that%20I%20am%20happy%20with%20my%20installation%20drawings.%20" style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;text-decoration:none;text-align:center;">',
        '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;">',
        '<font style="color:#3e3b39;" class="button">',
        '<span><strong>CONFIRM DRAWINGS</strong></span>',
        '</font>',
        '</span>',
        '</a>',
        '</td>',
        '</tr>',
        '</table>',
        '</div>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background-color:#ffffff;">',
        '<tr>',
        '<td valign="top"><table cellpadding="0" cellspacing="0" border="0" width="100%" class="mcol">',
        '<tr>',
        '<td valign="top" style="padding:0;mso-cellspacing:0in;">',
        '<!--[if gte mso 9]><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><![endif]-->',
        '<!--[if gte mso 9]><td valign="top" style="padding:0;width:277px;"><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" width="46.166666666666664%" class="col" align="left" style="float:left;">',
        '<tr>',
        '<td valign="top" width="100%" style="padding:0;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" class="hide-on-mobile">',
        '<tr>',
        '<td valign="top" style="padding:5px;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center" style="padding-top:20px;padding-bottom:20px;"><!--[if gte mso 9]><table width="220" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center"><a href="https://www.nu-heat.co.uk/ufh-onboarding/" title="Guide to your journey" class="imglink" target="_blank">',
        '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/6048a6c33ed94c5538fd760c/1691596900510_UFH customer journey.png" width="220" height="220" alt="Guide to your journey" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width220" />',
        '</a>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td><![endif]--><!--[if gte mso 9]><td valign="top" style="padding:0;width:322.99999999999994px;"><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" width="53.83333333333332%" class="col" align="left" style="float:left;">',
        '<tr>',
        '<td valign="top" width="100%" style="padding:0;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" class="hide-on-mobile">',
        '<tr>',
        '<td valign="top" style="padding:10px;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-right:20px;padding-bottom:10px;padding-left:20px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:25px;color:#59315f;font-weight:normal;line-height:30px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial"><strong>A Guide to your Nu-Heat Journey</strong></span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-top:5px;padding-right:20px;padding-left:20px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#3e3b39;font-weight:normal;line-height:22px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:left;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial">We promise you’ll Feel the Difference.</span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-right:20px;padding-left:20px;"><div><h3 style="font-family:Arial, Helvetica Neue, Helvetica, sans-serif;font-size:15px;color:#000000;font-weight:normal;line-height:15px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:0px;text-align:left;padding:0;margin:0;">&nbsp;</h3></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-right:20px;padding-bottom:5px;padding-left:20px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#3e3b39;font-weight:normal;line-height:22px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:2px;text-align:left;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial">This guide explains how we will fulfil this promise to you.</span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center" style="padding-top:20px;padding-right:20px;padding-bottom:10px;padding-left:20px;">',
        '<!--[if !mso]><!-- -->',
        '<a href="https://www.nu-heat.co.uk/ufh-onboarding/" title="Guide to your journey" target="_blank" style="display:inline-block; text-decoration:none;" class="fluid-on-mobile">',
        '<span>',
        '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">',
        '<tr>',
        '<td align="center" style="padding:15px;">',
        '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;">',
        '<font style="color:#3e3b39;" class="button">',
        '<span><strong>READ NOW</strong></span>',
        '</font>',
        '</span>',
        '</td>',
        '</tr>',
        '</table>',
        '</span>',
        '</a>',
        '<!--<![endif]-->',
        '<div style="display:none; mso-hide: none;">',
        '<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">',
        '<tr>',
        '<td align="center" style="padding:15px;">',
        '<a href="https://www.nu-heat.co.uk/ufh-onboarding/" title="Guide to your journey" target="_blank" style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;text-decoration:none;text-align:center;">',
        '<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;">',
        '<font style="color:#3e3b39;" class="button">',
        '<span><strong>READ NOW</strong></span>',
        '</font>',
        '</span>',
        '</a>',
        '</td>',
        '</tr>',
        '</table>',
        '</div>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td><![endif]-->',
        '<!--[if gte mso 9]></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td style="padding:10px;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #a9a9a9;">',
        '<tr>',
        '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" style="padding-top:10px;padding-right:10px;padding-bottom:20px;padding-left:10px;"><div style="font-family:Calibri, Arial, sans-serif;font-size:18px;color:#000000;font-weight:normal;line-height:24px;mso-line-height-rule:exactly;letter-spacing:normal;mso-text-raise:3px;text-align:center;"><p style="padding:0;margin:0;"><span class="mso-font-fix-arial">If you have any questions, you can contact your {{SENDER_ROLE}}, {{SENDER_NAME}}, via {{SENDER_EMAIL}} or {{SENDER_PHONE}}.</span></p></div>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">',
        '<tr>',
        '<td align="center" width="100%">',
        '<!--[if gte mso 9]><table width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table class="width600 main-container" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">',
        '<tr>',
        '<td width="100%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#ffffff" style="background-color:#ffffff;">',
        '<tr>',
        '<td valign="top" style="padding-bottom:10px;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#00857d" style="background-color:#00857d;">',
        '<tr>',
        '<td valign="top" style="padding-bottom:20px;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center"><!--[if gte mso 9]><table width="167" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center"><img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604422010305_Nu-Heat%20Master%20logo%20wht%20on%20green.png" width="167" height="94" alt="Nu-Heat Underfloor Heating & Renewables" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width167" />',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" width="30%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td style="padding-right:10px;padding-left:10px;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:10px solid transparent;">',
        '<tr>',
        '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '<td valign="top" width="0.8333333333333334%">&nbsp;</td>',
        '<td valign="top" width="7.000000000000002%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center"><a href="https://www.facebook.com/nuheatuk/" class="imglink" target="_blank">',
        '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604502171665_white%20-%20facebook.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />',
        '</a>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '<td valign="top" width="0.8333333333333334%">&nbsp;</td>',
        '<td valign="top" width="7%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center"><a href="https://www.instagram.com/nuheatufh/" class="imglink" target="_blank">',
        '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604502172039_white%20-%20instagram.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />',
        '</a>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '<td valign="top" width="0.8333333333333334%">&nbsp;</td>',
        '<td valign="top" width="7.000000000000002%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center"><a href="https://www.linkedin.com/company/nu-heat/" class="imglink" target="_blank">',
        '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604502171857_white%20-%20linkedin.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />',
        '</a>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '<td valign="top" width="0.8333333333333334%">&nbsp;</td>',
        '<td valign="top" width="7%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center"><a href="https://twitter.com/nuheatuk" class="imglink" target="_blank">',
        '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1697799506808_x-twitter-logo-white.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />',
        '</a>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '<td valign="top" width="0.8333333333333334%">&nbsp;</td>',
        '<td valign="top" width="7%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td valign="top" align="center"><!--[if gte mso 9]><table width="22" cellpadding="0" cellspacing="0"><tr><td><![endif]-->',
        '<table cellpadding="0" cellspacing="0" border="0" class="img-wrap" style="max-width:100%;">',
        '<tr>',
        '<td valign="top" align="center"><a href="https://youtube.com/channel/UCsfB8s56fcERuaBFovwYnGQ" class="imglink" target="_blank">',
        '<img src="https://images.chamaileon.io/5b1fac592f38b800113c85ca/5ca8626420e2346b3ee9a013/1604502172308_white%20-%20youtube.png" width="22" height="22" alt="" border="0" style="display:block;font-size:14px;max-width:100%;height:auto;" class="width22" />',
        '</a>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '<td valign="top" width="0.8333333333333334%">&nbsp;</td>',
        '<td valign="top" width="30%">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%">',
        '<tr>',
        '<td style="padding-right:10px;padding-left:10px;">',
        '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:10px solid transparent;">',
        '<tr>',
        '<td style="font-size:0px;line-height:0;mso-line-height-rule:exactly;">&nbsp;',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '<!--[if gte mso 9]></td></tr></table><![endif]-->',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</td>',
        '</tr>',
        '</table>',
        '</div>',
        '</body>',
        '</html>'
    ];

    /**
     * Body copy for the paragraph that used to read "Please find your bespoke
     * installation drawings attached." That sentence is untrue once nothing is
     * attached, so there are two variants and the caller picks by the checkbox.
     */
    var INTRO_COPY_LINKED =
        'Your bespoke installation drawings are ready. Please use the buttons below to ' +
        'open each document.';

    var INTRO_COPY_LINKED_AND_ATTACHED =
        'Please find your bespoke installation drawings attached. They are also ' +
        'available using the buttons below.';

    /**
     * Builds the CTA buttons for {{DOCUMENT_LINKS}}.
     *
     * The markup is copied from the CONFIRM DRAWINGS button in this same template,
     * INCLUDING its MSO conditional pair:
     *
     *   <!--[if !mso]><!-- -->   ... anchor-wrapped table, for everything else
     *   <!--<![endif]-->
     *   <div style="display:none; mso-hide: none;">  ... the Outlook fallback
     *
     * Both halves are required. Without the conditional, Outlook renders BOTH and the
     * button appears twice - which is why the pattern is in the original template, and
     * why it is reproduced here rather than simplified.
     *
     * @param {Array<Object>} documents  [{ label, url }]
     * @returns {string} HTML, or '' when there are no documents
     */
    function buildDocumentLinks(documents) {
        var html = [];
        var i;
        var label;
        var href;

        if (!documents || documents.length === 0) { return ''; }

        html.push('<table cellpadding="0" cellspacing="0" border="0" width="100%">');

        for (i = 0; i < documents.length; i++) {
            // The label is user-entered free text and goes into element content.
            label = config.escapeHtml(trimOrEmpty(documents[i].label));

            // The URL goes into an href. It is HTML-escaped - which turns the query
            // string's "&" into "&amp;" as an href requires - and NOT percent-encoded:
            // File.url is already a URL with an already-encoded query string, so
            // encoding it again would corrupt every link.
            href = config.escapeHtml(trimOrEmpty(documents[i].url));

            html.push('<tr>');
            html.push('<td valign="top" align="center" style="padding-right:20px;padding-bottom:12px;padding-left:20px;">');

            // Everything except Outlook.
            html.push('<!--[if !mso]><!-- -->');
            html.push('<a href="' + href + '" style="display:inline-block; text-decoration:none;" class="fluid-on-mobile">');
            html.push('<span>');
            html.push('<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">');
            html.push('<tr>');
            html.push('<td align="center" style="padding:15px;">');
            html.push('<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;">');
            html.push('<font style="color:#3e3b39;" class="button">');
            html.push('<span><strong>' + label + '</strong></span>');
            html.push('</font>');
            html.push('</span>');
            html.push('</td>');
            html.push('</tr>');
            html.push('</table>');
            html.push('</span>');
            html.push('</a>');
            html.push('<!--<![endif]-->');

            // Outlook only.
            html.push('<div style="display:none; mso-hide: none;">');
            html.push('<table cellpadding="0" cellspacing="0" border="0" bgcolor="#ffb500" class="fluid-on-mobile" style="border-radius:5px;border-collapse:separate !important;background-color:#ffb500;">');
            html.push('<tr>');
            html.push('<td align="center" style="padding:15px;">');
            html.push('<a href="' + href + '" style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;text-decoration:none;text-align:center;">');
            html.push('<span style="color:#3e3b39 !important;font-family:Calibri, Arial, sans-serif;font-size:18px;mso-line-height:exactly;line-height:22px;mso-text-raise:2px;letter-spacing: normal;">');
            html.push('<font style="color:#3e3b39;" class="button">');
            html.push('<span><strong>' + label + '</strong></span>');
            html.push('</font>');
            html.push('</span>');
            html.push('</a>');
            html.push('</td>');
            html.push('</tr>');
            html.push('</table>');
            html.push('</div>');

            html.push('</td>');
            html.push('</tr>');
        }

        html.push('</table>');

        return html.join('\n');
    }

    /**
     * Builds the email body.
     *
     * @param {Object} options
     * @param {string} options.projectRef   value for {{PROJECT_REF}}
     * @param {string} options.senderRole   'Project Engineer' or 'Account Manager'
     * @param {string} options.senderName
     * @param {string} options.senderEmail  the address PRINTED in the body, which for
     *                                      a project engineer is the shared design
     *                                      mailbox and not their own address
     * @param {string} options.senderPhone  officephone, or '' to drop the clause
     * @param {Array<Object>} options.documents  [{ label, url }] rendered as CTA buttons
     * @param {boolean} options.attachFiles  true when the files are also attached, which
     *                                       selects the body copy
     * @returns {string} the complete HTML body
     */
    function buildBody(options) {
        var opts = options || {};
        var html = TEMPLATE_LINES.join('\n');
        var phone = trimOrEmpty(opts.senderPhone);

        if (!phone) {
            // Drop the clause before substitution, so no empty "or ." is left behind.
            if (html.indexOf(PHONE_CLAUSE) === -1) {
                // The markup changed and this helper no longer matches it. Loud, because
                // silently shipping "via design@nu-heat.co.uk or ." is worse than failing.
                throw new Error('dsn_email_template: the phone clause "' + PHONE_CLAUSE +
                    '" was not found in the template markup, so it cannot be dropped for a ' +
                    'sender with no officephone. The template has been edited without ' +
                    'updating PHONE_CLAUSE.');
            }
            html = replaceAll(html, PHONE_CLAUSE, '');
        }

        // {{PROJECT_REF}} sits in body text; {{PROJECT_REF_URL}} sits inside the two
        // CONFIRM DRAWINGS mailto query strings. A reference like "OPP123 - 12 High St"
        // contains spaces and may contain '&', either of which breaks a mailto href if
        // it is only HTML-escaped, so the URL occurrences are percent-encoded instead.
        html = replaceAll(html, '{{PROJECT_REF_URL}}',
            config.escapeHtml(encodeURIComponent(trimOrEmpty(opts.projectRef))));
        html = replaceAll(html, '{{INTRO_COPY}}', config.escapeHtml(
            opts.attachFiles ? INTRO_COPY_LINKED_AND_ATTACHED : INTRO_COPY_LINKED));

        // Generated markup, so it is inserted as-is. Its user-supplied parts - the
        // labels - are escaped inside buildDocumentLinks, not here.
        html = replaceAll(html, '{{DOCUMENT_LINKS}}', buildDocumentLinks(opts.documents));

        html = replaceAll(html, '{{PROJECT_REF}}', config.escapeHtml(opts.projectRef));
        html = replaceAll(html, '{{SENDER_ROLE}}', config.escapeHtml(opts.senderRole));
        html = replaceAll(html, '{{SENDER_NAME}}', config.escapeHtml(opts.senderName));
        html = replaceAll(html, '{{SENDER_EMAIL}}', config.escapeHtml(opts.senderEmail));
        html = replaceAll(html, '{{SENDER_PHONE}}', config.escapeHtml(phone));

        return html;
    }

    /**
     * Literal replace-all. String.prototype.replace with a string pattern replaces
     * only the first occurrence, and {{PROJECT_REF}} appears three times - once in
     * the body and once in each of the two CONFIRM DRAWINGS mailto links. Building a
     * RegExp from the tag would need escaping of the braces, so this is done by hand.
     */
    function replaceAll(haystack, needle, replacement) {
        var out = '';
        var rest = String(haystack);
        var at = rest.indexOf(needle);

        while (at !== -1) {
            out = out + rest.substring(0, at) + replacement;
            rest = rest.substring(at + needle.length);
            at = rest.indexOf(needle);
        }
        return out + rest;
    }

    function trimOrEmpty(value) {
        if (value === null || value === undefined) { return ''; }
        return String(value).trim();
    }

    return {
        TEMPLATE_VERSION:    TEMPLATE_VERSION,
        buildBody:           buildBody,
        buildDocumentLinks:  buildDocumentLinks
    };

});
