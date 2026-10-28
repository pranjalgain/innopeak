/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  // Organized sidebar structure for better navigation
  tutorialSidebar: [
    'welcome',
    {
      type: 'category',
      label: 'Services',
      collapsed: false,
      items: [
        'services/overview',
        'services/backend-api',
        'services/worker-and-jobs',
        'services/web-app',
        'services/external-services',
        'services/configuration-reference',
        'services/platform-settings',
        'services/business-settings',
        'services/roles-and-permissions',
      ],
    },
    {
      type: 'category',
      label: 'Infrastructure',
      collapsed: false,
      items: [
        'infrastructure/overview',
        'infrastructure/environments',
        'infrastructure/compute-and-containers',
        'infrastructure/data-stores',
        'infrastructure/capacity-and-scaling',
        'infrastructure/secrets-and-access',
        'infrastructure/observability',
        'infrastructure/deployment-and-releases',
        'infrastructure/open-items',
      ],
    },
    {
      type: 'category',
      label: '🚀 Applications',
      collapsed: false,
      items: [
        {
          type: 'category',
          label: 'Backend',
          items: [
            'backend/overview',
            'backend/operations',
            {
              type: 'category',
              label: 'Modules',
              items: [
                {
                  type: 'category',
                  label: 'Auth',
                  items: [
                    'backend/auth/overview',
                    'backend/auth/api-reference',
                    'backend/auth/invite-flow-design',
                    'backend/auth/microsoft-login-design',
                    'backend/auth/separate-admin-login-design',
                    'backend/auth/tenant-member-invite-design',
                  ],
                },
                {
                  type: 'category',
                  label: 'Connections',
                  items: [
                    'backend/connections/overview',
                    'backend/connections/api-reference',
                    'backend/connections/google-api-setup',
                    'backend/connections/real-gbp-design',
                  ],
                },
                {
                  type: 'category',
                  label: 'Reviews',
                  items: ['backend/reviews/overview', 'backend/reviews/api-reference'],
                },
                {
                  type: 'category',
                  label: 'Prompts',
                  items: ['backend/prompts/overview', 'backend/prompts/api-reference'],
                },
                {
                  type: 'category',
                  label: 'AI',
                  items: ['backend/ai/overview', 'backend/ai/api-reference'],
                },
                {
                  type: 'category',
                  label: 'Settings',
                  items: ['backend/settings/overview', 'backend/settings/api-reference'],
                },
                {
                  type: 'category',
                  label: 'Notifications',
                  items: [
                    'backend/notifications/overview',
                    'backend/notifications/api-reference',
                    'backend/notifications/phase-one',
                  ],
                },
                {
                  type: 'category',
                  label: 'Media',
                  items: ['backend/media/overview', 'backend/media/api-reference'],
                },
                {
                  type: 'category',
                  label: 'Dashboard',
                  items: ['backend/dashboard/overview', 'backend/dashboard/api-reference'],
                },
                {
                  type: 'category',
                  label: 'Admin Overview',
                  items: [
                    'backend/admin-overview/overview',
                    'backend/admin-overview/api-reference',
                  ],
                },
                {
                  type: 'category',
                  label: 'Admin Billing',
                  items: [
                    'backend/admin-billing/overview',
                    'backend/admin-billing/api-reference',
                  ],
                },
                {
                  type: 'category',
                  label: 'Admin Management',
                  items: [
                    'backend/admin-management/overview',
                    'backend/admin-management/api-reference',
                  ],
                },
                {
                  type: 'category',
                  label: 'Platform Admin',
                  items: [
                    'backend/platform-admin/overview',
                    'backend/platform-admin/api-reference',
                  ],
                },
                {
                  type: 'category',
                  label: 'Billing',
                  items: ['backend/billing/overview', 'backend/billing/api-reference'],
                },
                'backend/review-pipeline/overview',
              ],
            },
            'backend/full-code-audit-2026-10',
          ],
        },
        {
          type: 'category',
          label: 'Frontend',
          items: ['frontend/overview', 'frontend/admin-console', 'frontend/ui-audit-2026-10'],
        },
        {
          type: 'category',
          label: 'Shared Libraries',
          items: ['shared/overview', 'shared/api-clients'],
        },
      ],
    },
    {
      type: 'category',
      label: '📚 Project Information',
      collapsed: false,
      items: [
        'meta/architecture',
        'meta/multilingual',
        'meta/contributing',
        'meta/style-guide',
        'meta/pipeline-changes',
        {
          type: 'category',
          label: 'Setup Guides',
          items: [
            'meta/guides/AddBackend',
            'meta/guides/AddFrontend',
            'meta/guides/AddLibs',
            'meta/guides/AddTests',
          ],
        },
      ],
    },
  ],
};

export default sidebars;
