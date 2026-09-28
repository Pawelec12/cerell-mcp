import { BasePartner, registry } from './base.js';
import { PartnerActionDef, ActionContext, ActionResult, PricingTier, PartnerCategory } from '../types.js';
import { randomUUID } from 'crypto';

export class NeonPartner extends BasePartner {
  readonly id = 'neon';
  readonly name = 'Neon';
  readonly category: PartnerCategory = 'database';
  readonly description = 'Serverless Postgres — branch your database like code';
  readonly website = 'https://neon.tech';
  readonly affiliateId = 'ref_NEON_INFRACOP';
  readonly commissionRate = 0.20;
  override readonly devCashbackRate = 0.1;
  readonly signupUrlTemplate = 'https://neon.tech/signup?ref={affiliate_id}&utm_source=infra-copilot&sub_id={dev_id}';
  readonly pricing: PricingTier[] = [
    { name: 'Free', monthlyPrice: 0, features: ['0.5 GB storage', '1 project', 'Community support'] },
    { name: 'Launch', monthlyPrice: 19, features: ['10 GB storage', '10 projects', 'Autoscaling', 'Branching'] },
    { name: 'Scale', monthlyPrice: 69, features: ['50 GB storage', 'Unlimited projects', 'Read replicas', 'IP allow list'] }
  ];

  getActions(): PartnerActionDef[] {
    return [
      {
        name: 'create_database',
        description: 'Create a new Neon database project',
        params: {
          name: { type: 'string', description: 'Project name', required: true },
          region: { type: 'string', description: 'AWS region', required: true, enum: ['aws-us-east-1', 'aws-eu-central-1', 'aws-ap-southeast-1'] },
          postgres_version: { type: 'number', description: 'PostgreSQL version', required: false, default: 16 }
        }
      },
      {
        name: 'create_branch',
        description: 'Create a database branch',
        params: {
          project_id: { type: 'string', description: 'Neon project ID', required: true },
          branch_name: { type: 'string', description: 'Name of the new branch', required: true },
          from_branch: { type: 'string', description: 'Parent branch to branch from', required: false, default: 'main' }
        }
      },
      {
        name: 'run_migration',
        description: 'Run SQL migration against a project',
        params: {
          project_id: { type: 'string', description: 'Neon project ID', required: true },
          sql: { type: 'string', description: 'SQL to execute', required: true }
        }
      },
      {
        name: 'list_databases',
        description: 'List all Neon database projects',
        params: {}
      }
    ];
  }

  async executeAction(actionName: string, params: Record<string, unknown>, context: ActionContext): Promise<ActionResult> {
    const handlers = new Map<string, (p: Record<string, unknown>, c: ActionContext) => ActionResult>();

    handlers.set('create_database', (p, _c) => {
      const region = (p.region as string) || 'aws-us-east-1';
      const projectId = randomUUID();
      const branchId = `br-${randomUUID().substring(0, 8)}`;
      const connStr = `postgresql://user:pass@ep-${branchId}.${region.replace('aws-', '')}.aws.neon.tech/mydb?sslmode=require`;
      
      return {
        success: true,
        message: `Database project ${p.name} created in ${region}`,
        data: { connection_string: connStr, dashboard_url: `https://console.neon.tech/app/projects/${projectId}`, branch_id: branchId, project_id: projectId },
        envVars: { DATABASE_URL: connStr }
      };
    });

    handlers.set('create_branch', (p, _c) => {
      const branchId = `br-${randomUUID().substring(0, 8)}`;
      const connStr = `postgresql://user:pass@ep-${branchId}.eu-central-1.aws.neon.tech/mydb?sslmode=require`;
      return {
        success: true,
        message: `Branch ${p.branch_name} created`,
        data: { branch_id: branchId, connection_string: connStr }
      };
    });

    handlers.set('run_migration', (_p, _c) => {
      return {
        success: true,
        message: 'Migration executed successfully',
        data: { rows_affected: 42, execution_time_ms: 153 }
      };
    });

    handlers.set('list_databases', (_p, _c) => {
      return {
        success: true,
        message: 'Retrieved databases',
        data: {
          databases: [
            { id: randomUUID(), name: 'prod-db', region: 'aws-us-east-1', created_at: new Date().toISOString() },
            { id: randomUUID(), name: 'staging-db', region: 'aws-us-east-1', created_at: new Date().toISOString() }
          ]
        }
      };
    });

    const handler = handlers.get(actionName);
    if (!handler) {
      return { success: false, message: `Action ${actionName} not supported` };
    }

    return Promise.resolve(handler(params, context));
  }

  async checkHealth(_apiKey: string): Promise<'healthy' | 'degraded' | 'down'> {
    return 'healthy';
  }

  async getUsageStats(_apiKey: string): Promise<Record<string, unknown>> {
    return {
      storage_gb: 0.3,
      compute_hours: 12,
      branches: 2,
      active_connections: 5
    };
  }

  getDocumentation(topic: string): string {
    const docs = new Map<string, string>([
      ['connection', 'Connect to Neon using Postgres drivers. Always use sslmode=require.'],
      ['branching', 'Create branches instantly via API to test schema changes isolated from production.'],
      ['migrations', 'Run migrations against isolated branches before deploying to main.'],
      ['scaling', 'Compute autoscales up to specified limits during load, and scales to zero when idle.']
    ]);
    return docs.get(topic) || 'Visit https://neon.tech/docs for more information.';
  }
}

registry.register(new NeonPartner());
