import { describe, it, expect } from 'vitest';
import { normalizeInstall, sanitizeId } from './registryService';

describe('MCP registry normalization', () => {
  it('maps an npm package to an npx stdio command with env + flags', () => {
    const inst = normalizeInstall({
      packages: [
        {
          registryType: 'npm',
          identifier: '@scope/server',
          version: '1.2.3',
          runtimeHint: 'npx',
          runtimeArguments: [{ value: '-y', type: 'positional' }],
          environmentVariables: [{ name: 'TOKEN', isRequired: true, isSecret: true }],
        },
      ],
    });
    expect(inst).toMatchObject({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@scope/server@1.2.3'],
      env: { TOKEN: '' },
      requiredKeys: ['TOKEN'],
      secretKeys: ['TOKEN'],
    });
  });

  it('infers uvx for a pypi package with no runtimeHint', () => {
    const inst = normalizeInstall({ packages: [{ registryType: 'pypi', identifier: 'mcp-foo', version: '0.1.0' }] });
    expect(inst).toMatchObject({ transport: 'stdio', command: 'uvx', args: ['mcp-foo@0.1.0'] });
  });

  it('maps an http remote with headers', () => {
    const inst = normalizeInstall({
      remotes: [
        {
          type: 'streamable-http',
          url: 'https://x/mcp',
          headers: [{ name: 'Authorization', value: 'Bearer {key}', isRequired: true, isSecret: true }],
        },
      ],
    });
    expect(inst).toMatchObject({
      transport: 'http',
      url: 'https://x/mcp',
      headers: { Authorization: 'Bearer {key}' },
      requiredKeys: ['Authorization'],
    });
  });

  it('keeps sse transport for an sse remote', () => {
    expect(normalizeInstall({ remotes: [{ type: 'sse', url: 'https://x/sse' }] })).toMatchObject({
      transport: 'sse',
      url: 'https://x/sse',
    });
  });

  it('returns null when there is nothing installable', () => {
    expect(normalizeInstall({ name: 'x' })).toBeNull();
  });

  it('sanitizes the server id to the last path segment', () => {
    expect(sanitizeId('io.github.owner/my-server')).toBe('my-server');
    expect(sanitizeId('ac.inference.sh/mcp')).toBe('mcp');
    expect(sanitizeId('weird name!/a b c')).toBe('a-b-c');
  });
});
