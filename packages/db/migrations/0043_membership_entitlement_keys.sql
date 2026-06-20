ALTER TABLE organization_entitlements
  DROP CONSTRAINT IF EXISTS organization_entitlements_entitlement_key_check,
  ADD CONSTRAINT organization_entitlements_entitlement_key_check
    CHECK (
      entitlement_key IN (
        'canvas_access',
        'priority_generation',
        'team_asset_library',
        'team_member_management',
        'team_dashboard',
        'full_flow_agent'
      )
    );
