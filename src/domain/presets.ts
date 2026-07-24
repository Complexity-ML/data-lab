import type { Edge } from '@xyflow/react'
import type { PipelineNode } from './pipeline'

type ScenarioPresetId = 'pii-masking' | 'schema-drift' | 'broken-governance'

interface ScenarioPreset {
  title: string
  nodes: PipelineNode[]
  edges: Edge[]
}

const fresh = { capturedAt: '2026-07-22T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', stale: false }

export const scenarioPresets: Record<ScenarioPresetId, ScenarioPreset> = {
  'pii-masking': {
    title: 'PII masking lab',
    nodes: [
      { id: 'pii-source', type: 'pipeline', position: { x: 100, y: 180 }, data: { kind: 'source', label: 'Synthetic customers', description: 'Public synthetic customer fixture with an intentionally exposed email field.', owner: 'Privacy Data', status: 'warning', schema: [{ name: 'customer_id', type: 'string' }, { name: 'email', type: 'string', tags: ['PII'] }], datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,data_lab_demo.synthetic_customers,PROD)', datahubTags: ['PII', 'SYNTHETIC'], datahubQuality: 'healthy', datahubFreshness: fresh } },
      { id: 'pii-output', type: 'pipeline', position: { x: 470, y: 180 }, data: { kind: 'output', label: 'Marketing audience', description: 'Intentionally unsafe direct output used to demonstrate the masking proposal.', owner: 'Growth Data', status: 'blocked', schema: [] } },
    ],
    edges: [{ id: 'e-pii-direct', source: 'pii-source', target: 'pii-output', type: 'elastic' }],
  },
  'schema-drift': {
    title: 'ML impact and schema drift',
    nodes: [
      { id: 'drift-source', type: 'pipeline', position: { x: 50, y: 180 }, data: { kind: 'source', label: 'Training customers v2', description: 'The synthetic training table changed customer_age from number to string.', owner: 'Customer Platform', status: 'warning', schema: [{ name: 'customer_id', type: 'string' }, { name: 'customer_age', type: 'string' }], datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,data_lab_demo.training_customers_v2,PROD)', datahubTags: ['SYNTHETIC', 'ML_TRAINING'], datahubQuality: 'healthy', datahubFreshness: fresh, datahubDownstream: [{ urn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,data_lab_demo.customer_features,PROD)', name: 'customer_features', sensitive: false }, { urn: 'urn:li:mlModel:(data_lab_demo,churn_prediction_v3,PROD)', name: 'churn_prediction_v3', sensitive: false }] } },
      { id: 'impact-lineage', type: 'pipeline', position: { x: 345, y: 180 }, data: { kind: 'impact', label: 'Trace ML lineage impact', description: 'Atomic, replayable analysis of training_customers_v2 → customer_features → age_bucket → churn_prediction_v3.', owner: 'DATA LAB Agent', status: 'warning', schema: [{ name: 'customer_id', type: 'string' }, { name: 'customer_age', type: 'string' }], rule: 'scope(customer_age type change) → rank affected features, pipelines, models and deployments → recommend actions' } },
      { id: 'risk-churn-model', type: 'pipeline', position: { x: 665, y: 180 }, data: { kind: 'risk', label: 'Assess churn model risk', description: 'Classifies the verified customer_age drift as a high ML risk across the feature table, age bucket and production model.', owner: 'DATA LAB Agent', status: 'blocked', schema: [], rule: 'scope=churn_prediction_v3 | risk_type=data | severity=high | confidence=0.93 | evidence=fresh | affected_assets=3 | action=repair_age_bucket_then_retrain' } },
      { id: 'drift-contract', type: 'pipeline', position: { x: 985, y: 180 }, data: { kind: 'validation', label: 'Feature schema contract', description: 'The feature pipeline still requires numeric customer_age.', owner: 'ML Platform', status: 'blocked', schema: [], rule: 'schema_contract: customer_id:string, customer_age:number' } },
      { id: 'drift-output', type: 'pipeline', position: { x: 1305, y: 180 }, data: { kind: 'output', label: 'churn_prediction_v3', description: 'Production model deployment at high risk until age_bucket is repaired and the model is retrained.', owner: 'ML Platform', status: 'blocked', schema: [] } },
    ],
    edges: [
      { id: 'e-drift-impact', source: 'drift-source', target: 'impact-lineage', type: 'elastic' },
      { id: 'e-impact-risk', source: 'impact-lineage', target: 'risk-churn-model', type: 'elastic' },
      { id: 'e-drift-contract', source: 'risk-churn-model', target: 'drift-contract', type: 'elastic' },
      { id: 'e-drift-output', source: 'drift-contract', target: 'drift-output', type: 'elastic' },
    ],
  },
  'broken-governance': {
    title: 'Ownership and quality lab',
    nodes: [
      { id: 'governance-source', type: 'pipeline', position: { x: 100, y: 180 }, data: { kind: 'source', label: 'Synthetic orders', description: 'Catalog fixture with no owner and a failing quality assertion.', owner: 'Unassigned', status: 'blocked', schema: [{ name: 'order_id', type: 'string' }, { name: 'amount', type: 'number' }], datahubUrn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,data_lab_demo.synthetic_orders,PROD)', datahubTags: ['SYNTHETIC'], datahubQuality: 'failing', datahubFreshness: fresh } },
      { id: 'governance-output', type: 'pipeline', position: { x: 470, y: 180 }, data: { kind: 'output', label: 'Finance metrics', description: 'Publishing remains blocked until ownership and quality are repaired.', owner: 'Finance Analytics', status: 'blocked', schema: [] } },
    ],
    edges: [{ id: 'e-governance-output', source: 'governance-source', target: 'governance-output', type: 'elastic' }],
  },
}
