import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../dist_safari');
const manifest = JSON.parse(readFileSync(resolve(output, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.persistent, undefined); // MV3 defaults to false.
assert.equal(manifest.background.type, undefined);
assert.equal(manifest.background.service_worker, undefined);
assert.equal(manifest.options_ui.open_in_tab, undefined);
const files = [...manifest.background.scripts, manifest.options_ui.page, manifest.action.default_popup,
    ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(c => [...c.js, ...(c.css || [])])];
for (const file of files) assert.ok(existsSync(resolve(output, file)), `Missing resource: ${file}`);
new vm.Script(readFileSync(resolve(output, manifest.background.scripts[0]), 'utf8'));
for (const html of [manifest.options_ui.page, manifest.action.default_popup]) {
    const source = readFileSync(resolve(output, html), 'utf8');
    assert.match(source, /data-platform="safari-ios"/);
    for (const match of source.matchAll(/(?:src|href)="([^"#]+)"/g)) {
        if (/^https?:/.test(match[1])) continue;
        const file = match[1].startsWith('/') ? resolve(output, `.${match[1]}`) : resolve(output, dirname(html), match[1]);
        assert.ok(existsSync(file), `Missing HTML resource: ${match[1]}`);
    }
}
console.log(JSON.stringify({ version: manifest.version, resources: files.length, classicBackgroundSyntax: 'passed', htmlReferences: 'passed' }));
