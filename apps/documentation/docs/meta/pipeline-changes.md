---
sidebar_position: 2
---

# PipeLine Changes

:::warning This page describes the starter template's pipeline
The `.gitlab-ci.yml` in the repository root is the template this project started from. It does not match
the current repository: it runs `yarn` and `prisma:setup`, refers to `apps/frontend`, and its deploy
jobs only print a message. The state of the automation, and what a working pipeline needs, are on
[Deployment and releases](../infrastructure/deployment-and-releases.md#state-of-the-automation).
:::

**Updates to `.gitlab-ci.yml` After Adding an App**

When adding new applications to the monorepo, you need to make corresponding changes to the `.gitlab-ci.yml` file to ensure the CI/CD pipeline recognizes and processes the new apps correctly. Below are the changes you need to implement:

---

## **General Changes**

1. **Update App References in `package.json`:**
   - Ensure the new app's `name` in its `package.json` matches the app folder name inside the `apps` directory.
   - For example, if the app folder name is `my-new-backend`, the `package.json` in that folder should contain:

     ```json
     {
       "name": "my-new-backend",
       ...
     }
     ```

2. **Add Build Scripts to Workspace `package.json`:**
   - Add build scripts for the new app in the root `package.json` file of the monorepo.
   - Example:

     ```json
     {
       "scripts": {
         "my-new-backend:build": "npm run build --workspace=my-new-backend",
         "my-new-frontend:build": "npm run build --workspace=my-new-frontend"
       }
     }
     ```

---

## **Changes in `.gitlab-ci.yml`**

### **1. Rename Existing App References**

- Wherever `backend` is referenced, replace it with the name of your new backend app as defined in its `package.json`.
- Similarly, update `apps/backend/**/*` or `apps/frontend/**/*` with the correct folder name inside the `apps` directory.

### **2. Add Steps for New Apps**

If you have added more than two apps, create additional steps for each app in the CI pipeline. Below is an example:

#### **Test Stage**

```yaml
build_test_new_backend:
  tags:
    - staging
  stage: test
  script:
    - yarn
    - yarn workspace my-new-backend run prisma:setup
    - yarn run my-new-backend:build
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      changes:
        - apps/my-new-backend/**/*
    - if: $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "main"
      changes:
        - apps/my-new-backend/**/*
    - if: $CI_COMMIT_BRANCH == "main"
      changes:
        - apps/my-new-backend/**/*

build_test_new_frontend:
  tags:
    - staging
  stage: test
  script:
    - yarn
    - yarn run my-new-frontend:build
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      changes:
        - apps/my-new-frontend/**/*
    - if: $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "main"
      changes:
        - apps/my-new-frontend/**/*
    - if: $CI_COMMIT_BRANCH == "main"
      changes:
        - apps/my-new-frontend/**/*
```

#### **Deploy Stage**

```yaml
deploy_new_backend:
  tags:
    - staging
  stage: deploy
  script:
    - echo "The new backend job triggered"
  when: manual
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      changes:
        - apps/my-new-backend/**/*

deploy_new_frontend:
  tags:
    - staging
  stage: deploy
  script:
    - echo "The new frontend job triggered"
  when: manual
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
      changes:
        - apps/my-new-frontend/**/*
```

### **3. Update Shared Build Steps (if needed)**

- For shared build steps, ensure that the `rules` section excludes changes for the new apps. For example:

```yaml
build_test_both:
  tags:
    - staging
  stage: test
  script:
    - yarn
    - yarn workspace pagestreet-backend run prisma:setup
    - yarn run backend:build
    - yarn run frontend:build
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      changes:
        - '!apps/frontend/**/*'
        - '!apps/backend/**/*'
        - '!apps/my-new-backend/**/*'
        - '!apps/my-new-frontend/**/*'
    - if: $CI_MERGE_REQUEST_TARGET_BRANCH_NAME == "main"
      changes:
        - '!apps/frontend/**/*'
        - '!apps/backend/**/*'
        - '!apps/my-new-backend/**/*'
        - '!apps/my-new-frontend/**/*'
    - if: $CI_COMMIT_BRANCH == "main"
      changes:
        - '*'
        - '**/*'
        - '!apps/frontend/**/*'
        - '!apps/backend/**/*'
        - '!apps/my-new-backend/**/*'
        - '!apps/my-new-frontend/**/*'
```

---

### **Summary**

1. Update the `package.json` of the monorepo to include build scripts for new apps.
2. Modify `.gitlab-ci.yml` to:
   - Replace default app references with new ones.
   - Add CI steps for testing and deploying new apps.
   - Update shared rules to account for new apps.

With these changes, the CI/CD pipeline will recognize and properly handle new apps added to the workspace. This ensures seamless integration and deployment across the monorepo. 🎉
