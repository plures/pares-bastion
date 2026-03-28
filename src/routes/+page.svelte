<script lang="ts">
	let appName = $state('netops-toolkit');
</script>

<main>
	<h1>{appName}</h1>
	<p>Network operations toolkit — Svelte 5 + Tauri 2</p>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		font-family: system-ui, sans-serif;
	}

	h1 {
		font-size: 2rem;
		margin-bottom: 0.5rem;
	}
</style>
