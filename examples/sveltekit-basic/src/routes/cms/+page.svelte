<script lang="ts">
import { CmsAdmin } from 'better-cms/admin';

const { data } = $props();
</script>

<CmsAdmin config={data.cms} auth />
