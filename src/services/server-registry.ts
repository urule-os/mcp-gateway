import { ulid } from 'ulid';

export interface McpServerRecord {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  transportType: 'stdio' | 'sse' | 'streamable-http';
  url?: string;
  status: 'registered' | 'connected' | 'disconnected' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface RegisterServerRequest {
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transportType?: 'stdio' | 'sse' | 'streamable-http';
  url?: string;
}

export interface WorkspaceBinding {
  id: string;
  workspaceId: string;
  serverId: string;
  config: Record<string, unknown>;
  status: 'active' | 'inactive';
  createdAt: string;
}

export class ServerRegistry {
  private servers = new Map<string, McpServerRecord>();
  private bindings = new Map<string, WorkspaceBinding>();
  private workspaceBindings = new Map<string, Set<string>>();

  register(request: RegisterServerRequest): McpServerRecord {
    const id = ulid();
    const now = new Date().toISOString();

    const server: McpServerRecord = {
      id,
      name: request.name,
      description: request.description ?? '',
      command: request.command,
      args: request.args ?? [],
      env: request.env ?? {},
      transportType: request.transportType ?? 'stdio',
      url: request.url,
      status: 'registered',
      createdAt: now,
      updatedAt: now,
    };

    this.servers.set(id, server);
    return server;
  }

  get(serverId: string): McpServerRecord | undefined {
    return this.servers.get(serverId);
  }

  list(): McpServerRecord[] {
    return Array.from(this.servers.values());
  }

  remove(serverId: string): boolean {
    return this.servers.delete(serverId);
  }

  updateStatus(serverId: string, status: McpServerRecord['status']): McpServerRecord | undefined {
    const server = this.servers.get(serverId);
    if (!server) return undefined;

    server.status = status;
    server.updatedAt = new Date().toISOString();
    return server;
  }

  bindToWorkspace(serverId: string, workspaceId: string, config?: Record<string, unknown>): WorkspaceBinding {
    const server = this.servers.get(serverId);
    if (!server) throw new Error(`Server not found: ${serverId}`);

    const id = ulid();
    const binding: WorkspaceBinding = {
      id,
      workspaceId,
      serverId,
      config: config ?? {},
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.bindings.set(id, binding);

    if (!this.workspaceBindings.has(workspaceId)) {
      this.workspaceBindings.set(workspaceId, new Set());
    }
    this.workspaceBindings.get(workspaceId)!.add(id);

    return binding;
  }

  getBinding(bindingId: string): WorkspaceBinding | undefined {
    return this.bindings.get(bindingId);
  }

  unbindFromWorkspace(bindingId: string): boolean {
    const binding = this.bindings.get(bindingId);
    if (!binding) return false;

    this.bindings.delete(bindingId);
    this.workspaceBindings.get(binding.workspaceId)?.delete(bindingId);
    return true;
  }

  getWorkspaceBindings(workspaceId: string): WorkspaceBinding[] {
    const bindingIds = this.workspaceBindings.get(workspaceId);
    if (!bindingIds) return [];

    return Array.from(bindingIds)
      .map((id) => this.bindings.get(id))
      .filter((b): b is WorkspaceBinding => b !== undefined);
  }

  getWorkspaceServers(workspaceId: string): McpServerRecord[] {
    const bindings = this.getWorkspaceBindings(workspaceId);
    return bindings
      .map((b) => this.servers.get(b.serverId))
      .filter((s): s is McpServerRecord => s !== undefined);
  }
}
