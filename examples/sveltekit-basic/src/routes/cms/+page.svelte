<script lang="ts">
import { CmsAdmin } from 'better-cms/admin';
import { cmsClient } from '$lib/cms/client';
</script>

<CmsAdmin client={cmsClient} auth />
