import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const backend = readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('./Dockerfile.frontend', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
for (const [name, dockerfile] of [['backend', backend], ['frontend', frontend]]) {
  assert.match(dockerfile, /ARG SPLEE_REF/);
  assert.match(dockerfile, /test -n "\$SPLEE_REF"/);
  assert.match(dockerfile, /git checkout --detach "\$SPLEE_REF"/);
  assert.doesNotMatch(dockerfile, /DATABASE_URL=|APP_SECRET=|SMTP_PASSWORD=/);
  assert.doesNotMatch(dockerfile, /FROM .*:latest/);
  console.log(name + ': source pin required; no embedded credentials');
}
assert.match(readme, /SENDING_ENABLED=false/);
assert.match(readme, /not yet CI-built|not a tested deployment/i);
console.log('staging configuration static checks passed');
