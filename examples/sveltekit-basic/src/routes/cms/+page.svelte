<script lang="ts">
import { CMSAdmin } from 'better-cms/admin';

const { data } = $props();
</script>

<CMSAdmin config={data.cms} auth />
