import type { Edge } from '@xyflow/react'
import type { PipelineNode } from './pipeline'

type ScenarioPresetId = 'order-details-privacy' | 'pii-masking' | 'schema-drift' | 'broken-governance'

interface ScenarioPreset {
  title: string
  nodes: PipelineNode[]
  edges: Edge[]
}

const fresh = { capturedAt: '2026-07-22T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', stale: false }
const orderDetailsUrn = 'urn:li:dataset:(urn:li:dataPlatform:dbt,b2fd91.ORDER_ENTRY_DB.analytics.order_details,PROD)'

export const scenarioPresets: Record<ScenarioPresetId, ScenarioPreset> = {
  'order-details-privacy': {
    title: 'Demo · order_details privacy risk',
    nodes: [
      {
        id: 'demo-order-details-source',
        type: 'pipeline',
        position: { x: 40, y: 220 },
        data: {
          kind: 'source',
          label: 'order_details',
          description: 'Real dbt dataset resolved through DataHub OSS. The demo uses only captured catalog metadata and never reads or stores raw rows.',
          owner: 'Data Governance',
          status: 'warning',
          schema: [
            { name: 'customer_id', type: 'number', tags: ['PII'] },
            { name: 'cust_email', type: 'string', tags: ['PII'] },
            { name: 'cust_first_name', type: 'string', tags: ['PII'] },
            { name: 'cust_last_name', type: 'string', tags: ['PII'] },
            { name: 'phone_number', type: 'string', tags: ['PII'] },
            { name: 'billing_address_line1', type: 'string', tags: ['PII'] },
            { name: 'billing_address_line2', type: 'string', tags: ['PII'] },
            { name: 'billing_country', type: 'string', tags: ['PII'] },
            { name: 'billing_region', type: 'string', tags: ['PII'] },
            { name: 'billing_town_city', type: 'string', tags: ['PII'] },
            { name: 'billing_zipcode', type: 'number', tags: ['PII'] },
            { name: 'order_total', type: 'number', tags: ['PII'] },
          ],
          datahubUrn: orderDetailsUrn,
          datahubPlatform: 'dbt',
          datahubEnvironment: 'PROD',
          datahubTags: ['PII'],
          datahubQuality: 'healthy',
          datahubFreshness: fresh,
        },
      },
      {
        id: 'demo-order-details-profile',
        type: 'pipeline',
        position: { x: 355, y: 220 },
        data: {
          kind: 'profile',
          label: 'Metadata profile',
          description: 'Versioned DataHub snapshot: 40 fields, 12 PII classifications and no raw rows. Aggregate value profiling is unavailable and is kept as a coverage gap.',
          owner: 'DATA LAB Agent',
          status: 'healthy',
          schema: [],
          rule: '40 fields · 12 sensitive · healthy · fresh · aggregate coverage gap · 18 downstream · metadata-only',
          profile: {
            sourceUrn: orderDetailsUrn,
            capturedAt: fresh.capturedAt,
            expiresAt: fresh.expiresAt,
            stale: false,
            platform: 'dbt',
            environment: 'PROD',
            quality: 'healthy',
            fieldCount: 40,
            profiledFields: [
              { name: 'customer_id', type: 'number', tags: ['PII'] },
              { name: 'cust_email', type: 'string', tags: ['PII'] },
              { name: 'cust_first_name', type: 'string', tags: ['PII'] },
              { name: 'cust_last_name', type: 'string', tags: ['PII'] },
              { name: 'phone_number', type: 'string', tags: ['PII'] },
              { name: 'billing_address_line1', type: 'string', tags: ['PII'] },
              { name: 'billing_address_line2', type: 'string', tags: ['PII'] },
              { name: 'billing_country', type: 'string', tags: ['PII'] },
              { name: 'billing_region', type: 'string', tags: ['PII'] },
              { name: 'billing_town_city', type: 'string', tags: ['PII'] },
              { name: 'billing_zipcode', type: 'number', tags: ['PII'] },
              { name: 'order_total', type: 'number', tags: ['PII'] },
            ],
            sensitiveFieldCount: 12,
            upstreamCount: 0,
            downstreamCount: 18,
            anomalies: [
              'Statistical profile metadata is unavailable; value-level health was not asserted.',
              '12 sensitive fields require governed handling.',
            ],
            aggregateAudit: {
              kind: 'bounded-aggregate-profile',
              version: 1,
              status: 'coverage_gap',
              capturedAt: fresh.capturedAt,
              profiledFieldCount: 0,
              riskSignals: [],
              rawRowsRead: false,
              hostVerified: true,
            },
            tokenEstimate: 520,
            storage: { kind: 'bounded-metadata', version: 1, rawRowsStored: false, hostVerified: true },
          },
        },
      },
      {
        id: 'demo-order-details-impact',
        type: 'pipeline',
        position: { x: 670, y: 220 },
        data: {
          kind: 'impact',
          label: '18 downstream datasets',
          description: 'Captured lineage proves propagation across Snowflake, dbt, Looker, Power BI and Tableau without making a value-level anomaly claim.',
          owner: 'DATA LAB Agent',
          status: 'warning',
          schema: [],
          rule: 'scope=order_details PII propagation | downstream_datasets=18 | platforms=snowflake,dbt,looker,powerbi,tableau | evidence=fresh',
        },
      },
      {
        id: 'demo-order-details-risk',
        type: 'pipeline',
        position: { x: 985, y: 220 },
        data: {
          kind: 'risk',
          label: 'Privacy risk · HIGH',
          description: 'Fresh schema tags and captured lineage support a high privacy risk across 18 downstream datasets. This is not presented as a statistical data anomaly.',
          owner: 'DATA LAB Agent',
          status: 'blocked',
          schema: [],
          rule: 'scope=order_details | risk_domain=privacy | risk_type=data | severity=high | confidence=0.95 | evidence=fresh | affected_assets=18 | action=human_review_then_apply_versioned_sensitive_field_protection',
        },
      },
      {
        id: 'demo-order-details-review',
        type: 'pipeline',
        position: { x: 1300, y: 220 },
        data: {
          kind: 'review',
          label: 'Review protection contract',
          description: 'A data steward approves the exact versioned masking contract before the governed output is emitted.',
          owner: 'Data Governance',
          status: 'draft',
          schema: [],
          rule: 'checkpoint=privacy_risk | requires=explicit_approval | affected_assets=18',
        },
      },
      {
        id: 'demo-order-details-protection',
        type: 'pipeline',
        position: { x: 1615, y: 220 },
        data: {
          kind: 'transform',
          label: 'Protect sensitive fields',
          description: 'Tokenize identifiers, hash email and redact direct contact and billing address fields in the versioned derived contract.',
          owner: 'Analytics Engineering',
          status: 'draft',
          schema: [],
          rule: 'tokenize(customer_id); sha256(lower(cust_email)); redact(phone_number, billing_address_line1, billing_address_line2)',
        },
      },
      {
        id: 'demo-order-details-output',
        type: 'pipeline',
        position: { x: 1930, y: 220 },
        data: {
          kind: 'output',
          label: 'Protected analytics',
          description: 'Governed analytics output receives only the reviewed and protected path.',
          owner: 'Analytics',
          status: 'draft',
          schema: [],
        },
      },
    ],
    edges: [
      { id: 'e-demo-order-profile', source: 'demo-order-details-source', target: 'demo-order-details-profile', type: 'elastic' },
      { id: 'e-demo-profile-impact', source: 'demo-order-details-profile', target: 'demo-order-details-impact', type: 'elastic' },
      { id: 'e-demo-impact-risk', source: 'demo-order-details-impact', target: 'demo-order-details-risk', type: 'elastic' },
      { id: 'e-demo-risk-review', source: 'demo-order-details-risk', target: 'demo-order-details-review', type: 'elastic' },
      { id: 'e-demo-review-protection', source: 'demo-order-details-review', target: 'demo-order-details-protection', type: 'elastic' },
      { id: 'e-demo-protection-output', source: 'demo-order-details-protection', target: 'demo-order-details-output', type: 'elastic' },
    ],
  },
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
