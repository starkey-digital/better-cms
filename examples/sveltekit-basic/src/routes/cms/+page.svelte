<script lang="ts">
import { cmsClient } from '$lib/cms/client';
import { CmsAdmin } from 'better-cms/admin';
</script>

<CmsAdmin client={cmsClient} auth />
