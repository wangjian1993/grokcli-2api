<script lang="ts" setup>
import type { DescriptionsProps } from 'antdv-next';

import { computed } from 'vue';

import { Page } from '@/components';
import { Card, Descriptions } from 'antdv-next';

defineOptions({ name: 'About' });

declare global {
  const __VBEN_ADMIN_METADATA__: {
    authorEmail: string;
    authorName: string;
    authorUrl: string;
    buildTime: string;
    dependencies: Record<string, string>;
    description: string;
    devDependencies: Record<string, string>;
    homepage: string;
    license: string;
    repositoryUrl: string;
    version: string;
  };
}

type AboutDescriptionItem = DescriptionsProps['items'];

const description = 'grokcli-2api 管理台（Vue3 + antdv-next）';
const name = 'grokcli-2api Admin';
const title = '关于项目';

const {
  buildTime,
  dependencies = {},
  devDependencies = {},
  license,
  version,
  // vite inject-metadata 插件注入的全局变量
} = __VBEN_ADMIN_METADATA__ || {};

const descriptionColumn = {
  lg: 4,
  md: 3,
  sm: 1,
  xl: 4,
  xs: 1,
};

const baseInfoItems = computed<AboutDescriptionItem>(() => [
  {
    content: version,
    label: '版本号',
  },
  {
    content: license,
    label: '开源许可协议',
  },
  {
    content: buildTime,
    label: '最后构建时间',
  },
]);

const dependenciesItems = computed<AboutDescriptionItem>(() =>
  Object.entries(dependencies).map(([label, content]) => ({
    content,
    label,
  })),
);

const devDependenciesItems = computed<AboutDescriptionItem>(() =>
  Object.entries(devDependencies).map(([label, content]) => ({
    content,
    label,
  })),
);
</script>

<template>
  <Page :title="title" content-class="flex flex-col gap-4">
    <template #description>
      <p class="text-foreground mt-3 text-sm/6">
        <span class="font-medium">{{ name }}</span>
        {{ description }}
      </p>
    </template>
    <Card size="small" title="基本信息">
      <Descriptions
        :column="descriptionColumn"
        :items="baseInfoItems"
        bordered
        size="small"
      />
    </Card>

    <Card size="small" title="生产环境依赖">
      <Descriptions
        :column="descriptionColumn"
        :items="dependenciesItems"
        bordered
        size="small"
      />
    </Card>
    <Card size="small" title="开发环境依赖">
      <Descriptions
        :column="descriptionColumn"
        :items="devDependenciesItems"
        bordered
        size="small"
      />
    </Card>
  </Page>
</template>
