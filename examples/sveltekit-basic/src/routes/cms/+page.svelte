<script lang="ts">
import { cmsConfig } from '$lib/cmsClient';
import { CmsAdmin } from 'better-cms/admin';
</script>

<CmsAdmin config={cmsConfig} auth />
