const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
service.use(gfm);
module.exports = html => service.turndown(html);
