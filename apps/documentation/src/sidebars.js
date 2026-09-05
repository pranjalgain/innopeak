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
      label: '🚀 Applications',
      collapsed: false,
      items: [
        {
          type: 'category',
          label: 'Backend',
          items: [
            'backend/overview',
            {
              type: 'category',
              label: 'Modules',
              items: [
                {
                  type: 'category',
                  label: 'Auth',
                  items: ['backend/auth/overview', 'backend/auth/api-reference'],
                },
                {
                  type: 'category',
                  label: 'Connections',
                  items: [
                    'backend/connections/overview',
                    'backend/connections/api-reference',
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
                  label: 'Settings',
                  items: ['backend/settings/overview', 'backend/settings/api-reference'],
                },
                {
                  type: 'category',
                  label: 'Notifications',
                  items: [
                    'backend/notifications/overview',
                    'backend/notifications/api-reference',
                  ],
                },
                {
                  type: 'category',
                  label: 'Dashboard',
                  items: ['backend/dashboard/overview', 'backend/dashboard/api-reference'],
                },
                {
                  type: 'category',
                  label: 'Platform Admin',
                  items: [
                    'backend/platform-admin/overview',
                    'backend/platform-admin/api-reference',
                  ],
                },
                'backend/review-pipeline/overview',
              ],
            },
          ],
        },
        {
          type: 'category',
          label: 'Frontend',
          items: ['frontend/overview'],
        },
        {
          type: 'category',
          label: 'Shared Libraries',
          items: ['shared/overview'],
        },
      ],
    },
    {
      type: 'category',
      label: '📚 Project Information',
      collapsed: false,
      items: [
        'meta/architecture',
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
