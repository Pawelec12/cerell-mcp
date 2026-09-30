import { InfraGraph, ServiceNode, Connection, PartnerCategory } from './types.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MCP_DATA_DIR } from './paths.js';

export class InfraStateGraph {
  private graphs: Map<string, InfraGraph> = new Map();
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
  }

  private getFilePath(devId: string): string {
    return path.join(this.dataDir, `${devId}.json`);
  }

  private getOrCreateGraph(devId: string): InfraGraph {
    let graph = this.graphs.get(devId);
    if (!graph) {
      graph = {
        devId,
        services: {},
        connections: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.graphs.set(devId, graph);
    }
    return graph;
  }

  async load(devId: string): Promise<InfraGraph> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const filePath = this.getFilePath(devId);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const graph = JSON.parse(data) as InfraGraph;
      this.graphs.set(devId, graph);
      return graph;
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        const newGraph = this.getOrCreateGraph(devId);
        await this.save(devId);
        return newGraph;
      }
      throw error;
    }
  }

  async save(devId: string): Promise<void> {
    const graph = this.graphs.get(devId);
    if (!graph) return;
    
    graph.updatedAt = new Date().toISOString();
    await fs.mkdir(this.dataDir, { recursive: true });
    
    const filePath = this.getFilePath(devId);
    const tmpPath = `${filePath}.tmp`;
    
    await fs.writeFile(tmpPath, JSON.stringify(graph, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  async addService(devId: string, service: ServiceNode): Promise<void> {
    const graph = await this.load(devId);
    graph.services[service.id] = service;
    await this.save(devId);
  }

  async removeService(devId: string, serviceId: string): Promise<void> {
    const graph = await this.load(devId);
    delete graph.services[serviceId];
    graph.connections = graph.connections.filter(c => c.fromServiceId !== serviceId && c.toServiceId !== serviceId);
    await this.save(devId);
  }

  async updateService(devId: string, serviceId: string, updates: Partial<ServiceNode>): Promise<void> {
    const graph = await this.load(devId);
    if (graph.services[serviceId]) {
      graph.services[serviceId] = { ...graph.services[serviceId], ...updates };
      await this.save(devId);
    }
  }

  async addConnection(devId: string, connection: Connection): Promise<void> {
    const graph = await this.load(devId);
    graph.connections.push(connection);
    await this.save(devId);
  }

  async getService(devId: string, serviceId: string): Promise<ServiceNode | undefined> {
    const graph = await this.load(devId);
    return graph.services[serviceId];
  }

  async getServicesByPartner(devId: string, partner: string): Promise<ServiceNode[]> {
    const graph = await this.load(devId);
    return Object.values(graph.services).filter(s => s.partner === partner);
  }

  async getServicesByCategory(devId: string, category: PartnerCategory): Promise<ServiceNode[]> {
    const graph = await this.load(devId);
    return Object.values(graph.services).filter(s => s.category === category);
  }

  async getGraph(devId: string): Promise<InfraGraph> {
    return await this.load(devId);
  }

  async getAllServices(devId: string): Promise<ServiceNode[]> {
    const graph = await this.load(devId);
    return Object.values(graph.services);
  }

  async getConnections(devId: string): Promise<Connection[]> {
    const graph = await this.load(devId);
    return graph.connections;
  }
}

export const graph = new InfraStateGraph(MCP_DATA_DIR);
