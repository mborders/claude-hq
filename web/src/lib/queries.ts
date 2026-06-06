import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ScopesResponse,
  Scope,
  AppConfig,
  SettingsResponse,
  ArtifactEnvelope,
  PermissionsBlock,
  HookRow,
  HooksBlock,
  ArtifactListResponse,
  Subagent,
  SlashCommand,
  Skill,
  ArtifactType,
  McpListResponse,
  PluginsResponse,
  MemoryListResponse,
  MemoryDoc,
  WriteResult,
  BackupsResponse,
  BackupPreviewResponse,
  RuntimeSummary,
  ProjectRef,
  McpRegistrySearchResponse,
  PluginRegistrySearchResponse,
  TransferRequest,
  TransferResult,
  SkillImportRequest,
  SkillImportPreview,
  SkillImportResult,
  TreeResponse,
  FileMeta,
} from '@claude-hq/shared';
import { api, qk, scopeUrl } from './api';

const enc = encodeURIComponent;

// --- queries ---

export function useScopes() {
  return useQuery({ queryKey: qk.scopes, queryFn: () => api.get<ScopesResponse>('/api/scopes') });
}

export function useAppConfig() {
  return useQuery({ queryKey: qk.appConfig, queryFn: () => api.get<AppConfig>('/api/app-config') });
}

export function useScope(scopeId: string) {
  return useQuery({ queryKey: qk.scope(scopeId), queryFn: () => api.get<Scope>(scopeUrl(scopeId)) });
}

export function useSettings(scopeId: string) {
  return useQuery({
    queryKey: qk.settings(scopeId),
    queryFn: () => api.get<SettingsResponse>(scopeUrl(scopeId, '/settings')),
  });
}

export function usePermissions(scopeId: string) {
  return useQuery({
    queryKey: qk.permissions(scopeId),
    queryFn: () => api.get<ArtifactEnvelope<PermissionsBlock>>(scopeUrl(scopeId, '/permissions')),
  });
}

export function useHooks(scopeId: string) {
  return useQuery({
    queryKey: qk.hooks(scopeId),
    queryFn: () => api.get<{ rows: HookRow[]; raw: HooksBlock }>(scopeUrl(scopeId, '/hooks')),
  });
}

export function useArtifacts(scopeId: string, type: ArtifactType) {
  return useQuery({
    queryKey: qk.list(scopeId, type),
    queryFn: () => api.get<ArtifactListResponse>(scopeUrl(scopeId, `/${type}`)),
  });
}

export function useArtifact(scopeId: string, type: ArtifactType, name: string, enabled = true) {
  return useQuery({
    queryKey: qk.artifact(scopeId, type, name),
    enabled,
    queryFn: () =>
      api.get<ArtifactEnvelope<Subagent | SlashCommand | Skill>>(
        scopeUrl(scopeId, `/${type}/${enc(name)}`),
      ),
  });
}

export function useMcp(scopeId: string, reveal = false) {
  return useQuery({
    queryKey: qk.mcp(scopeId, reveal),
    queryFn: () => api.get<McpListResponse>(scopeUrl(scopeId, `/mcp?reveal=${reveal}`)),
  });
}

export function usePlugins(scopeId: string) {
  return useQuery({
    queryKey: qk.plugins(scopeId),
    queryFn: () => api.get<PluginsResponse>(scopeUrl(scopeId, '/plugins')),
  });
}

export function useMemoryList(scopeId: string) {
  return useQuery({
    queryKey: qk.memory(scopeId),
    queryFn: () => api.get<MemoryListResponse>(scopeUrl(scopeId, '/memory')),
  });
}

export function useMemoryDoc(scopeId: string, relPath: string, enabled = true) {
  return useQuery({
    queryKey: qk.memoryDoc(scopeId, relPath),
    enabled,
    queryFn: () =>
      api.get<ArtifactEnvelope<MemoryDoc>>(scopeUrl(scopeId, `/memory/doc?relPath=${enc(relPath)}`)),
  });
}

export function useBackups(scopeId: string, relPath: string, enabled = true) {
  return useQuery({
    queryKey: qk.backups(scopeId, relPath),
    enabled: enabled && !!relPath,
    queryFn: () => api.get<BackupsResponse>(scopeUrl(scopeId, `/backups?relPath=${enc(relPath)}`)),
  });
}

export function useBackupPreview(scopeId: string, backupId: string, relPath: string, enabled = true) {
  return useQuery({
    queryKey: ['backup-preview', scopeId, backupId, relPath],
    enabled: enabled && !!backupId && !!relPath,
    queryFn: () =>
      api.get<BackupPreviewResponse>(scopeUrl(scopeId, `/backups/${enc(backupId)}?relPath=${enc(relPath)}`)),
  });
}

export function useRuntime(scopeId: string) {
  return useQuery({
    queryKey: qk.runtime(scopeId),
    queryFn: () => api.get<RuntimeSummary>(scopeUrl(scopeId, '/runtime/summary')),
  });
}

// --- mutations ---

function invalidateScope(qc: QueryClient, scopeId: string) {
  void qc.invalidateQueries({ queryKey: qk.scopes });
  void qc.invalidateQueries({ queryKey: qk.scope(scopeId) });
}

export function useWritePermissions(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { structured: PermissionsBlock; expectedSha256?: string; confirm?: boolean }) =>
      api.put<WriteResult>(scopeUrl(scopeId, '/permissions'), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.permissions(scopeId) });
      void qc.invalidateQueries({ queryKey: qk.settings(scopeId) });
    },
  });
}

export function useWriteSettings(scopeId: string, variant: 'settings' | 'local') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { structured: unknown; expectedSha256?: string; confirm?: boolean }) =>
      api.put<WriteResult>(scopeUrl(scopeId, `/settings/${variant}`), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.settings(scopeId) });
      void qc.invalidateQueries({ queryKey: qk.permissions(scopeId) });
      void qc.invalidateQueries({ queryKey: qk.plugins(scopeId) });
    },
  });
}

export function useWriteHooks(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rows: HookRow[]; expectedSha256?: string; confirm?: boolean }) =>
      api.put<WriteResult>(scopeUrl(scopeId, '/hooks'), body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.hooks(scopeId) }),
  });
}

export function useUpsertArtifact(scopeId: string, type: ArtifactType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      create: boolean;
      structured?: { frontmatter: Record<string, unknown> | null; body: string };
      raw?: string;
      expectedSha256?: string;
    }) =>
      input.create
        ? api.post<WriteResult>(scopeUrl(scopeId, `/${type}`), input)
        : api.put<WriteResult>(scopeUrl(scopeId, `/${type}/${enc(input.name)}`), input),
    onSuccess: (_r, input) => {
      void qc.invalidateQueries({ queryKey: qk.list(scopeId, type) });
      void qc.invalidateQueries({ queryKey: qk.artifact(scopeId, type, input.name) });
      invalidateScope(qc, scopeId);
    },
  });
}

export function useDeleteArtifact(scopeId: string, type: ArtifactType) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.del<{ backup?: unknown }>(scopeUrl(scopeId, `/${type}/${enc(name)}?confirm=true`)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.list(scopeId, type) });
      invalidateScope(qc, scopeId);
    },
  });
}

export function useWriteMemory(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { relPath: string; raw?: string; structured?: MemoryDoc; expectedSha256?: string }) =>
      api.put<WriteResult>(scopeUrl(scopeId, `/memory/doc?relPath=${enc(body.relPath)}`), body),
    onSuccess: (_r, body) => {
      void qc.invalidateQueries({ queryKey: qk.memory(scopeId) });
      void qc.invalidateQueries({ queryKey: qk.memoryDoc(scopeId, body.relPath) });
      invalidateScope(qc, scopeId);
    },
  });
}

export function useUpsertMcp(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; server: Record<string, unknown>; create: boolean; expectedSha256?: string }) =>
      input.create
        ? api.post<WriteResult>(scopeUrl(scopeId, '/mcp'), input)
        : api.put<WriteResult>(scopeUrl(scopeId, `/mcp/${enc(input.id)}`), input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mcp', scopeId] });
      invalidateScope(qc, scopeId);
    },
  });
}

export function useDeleteMcp(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<WriteResult>(scopeUrl(scopeId, `/mcp/${enc(id)}?confirm=true`)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['mcp', scopeId] }),
  });
}

export function useTogglePlugin(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    // `enabled: null` clears this scope's override (reverts to the inherited/global state).
    mutationFn: (input: { pluginId: string; enabled: boolean | null }) =>
      api.put<WriteResult>(scopeUrl(scopeId, `/plugins/${enc(input.pluginId)}/enabled`), {
        enabled: input.enabled,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.plugins(scopeId) });
      void qc.invalidateQueries({ queryKey: qk.settings(scopeId) });
    },
  });
}

export function useAddMarketplace(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; repo: string }) =>
      api.post<WriteResult>(scopeUrl(scopeId, '/marketplaces'), input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.plugins(scopeId) }),
  });
}

export function useRemoveMarketplace(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.del<WriteResult>(scopeUrl(scopeId, `/marketplaces/${enc(name)}?confirm=true`)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.plugins(scopeId) }),
  });
}

export function useRestoreBackup(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { backupId: string; relPath: string }) =>
      api.post<WriteResult>(scopeUrl(scopeId, `/backups/${enc(input.backupId)}/restore`), {
        relPath: input.relPath,
        confirm: true,
      }),
    onSuccess: () => void qc.invalidateQueries(),
  });
}

// --- project management ---

export function useScanProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ projects: ProjectRef[] }>('/api/projects/scan'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.scopes }),
  });
}

export function useAddProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.post<ProjectRef>('/api/projects/manual', { path }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.scopes }),
  });
}

export function useInitScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scopeId: string) => api.post<{ scope: Scope }>(scopeUrl(scopeId, '/init')),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.scopes }),
  });
}

export function useUpdateAppConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppConfig>) => api.patch<AppConfig>('/api/app-config', patch),
    onSuccess: (cfg) => {
      qc.setQueryData(qk.appConfig, cfg);
      void qc.invalidateQueries({ queryKey: qk.scopes });
    },
  });
}

// --- registry / marketplace discovery ---

export function useMcpRegistrySearch(query: string) {
  return useQuery({
    queryKey: ['registry-mcp', query],
    queryFn: () => api.get<McpRegistrySearchResponse>(`/api/registry/mcp?q=${enc(query)}`),
    staleTime: 60_000,
  });
}

export function usePluginRegistrySearch(query: string) {
  return useQuery({
    queryKey: ['registry-plugins', query],
    queryFn: () => api.get<PluginRegistrySearchResponse>(`/api/registry/plugins?q=${enc(query)}`),
    staleTime: 60_000,
  });
}

// --- cross-scope move / copy ---

export function useTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: TransferRequest) => api.post<TransferResult>('/api/transfer', req),
    // A transfer touches two scopes' lists; refresh everything.
    onSuccess: () => void qc.invalidateQueries(),
  });
}

// --- file tree + raw read (skill supporting files) ---

export function useTree(scopeId: string, subdir: string, recursive = false, enabled = true) {
  return useQuery({
    queryKey: ['tree', scopeId, subdir, recursive],
    enabled: enabled && !!subdir,
    queryFn: () =>
      api.get<TreeResponse>(scopeUrl(scopeId, `/tree?subdir=${enc(subdir)}&recursive=${recursive}`)),
  });
}

export function useRawFile(scopeId: string, relPath: string, enabled = true) {
  return useQuery({
    queryKey: ['raw', scopeId, relPath],
    enabled: enabled && !!relPath,
    queryFn: () => api.get<{ meta: FileMeta; raw: string }>(scopeUrl(scopeId, `/raw?relPath=${enc(relPath)}`)),
  });
}

// --- skill import (.skill upload) ---

export function useImportSkill(scopeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SkillImportRequest) =>
      api.post<SkillImportPreview | SkillImportResult>(scopeUrl(scopeId, '/skills/import'), req),
    onSuccess: (_res, req) => {
      if (req.dryRun) return; // preview only — nothing changed
      void qc.invalidateQueries({ queryKey: qk.list(scopeId, 'skills') });
      void qc.invalidateQueries({ queryKey: qk.scopes });
      void qc.invalidateQueries({ queryKey: qk.scope(scopeId) });
    },
  });
}
