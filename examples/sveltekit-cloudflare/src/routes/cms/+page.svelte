<script lang="ts">
import { CmsAdmin } from 'better-cms/admin';
import { cmsClient } from '#lib/cms/client.ts';
</script>

<CmsAdmin client={cmsClient} auth />
