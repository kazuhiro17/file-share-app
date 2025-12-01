const nextConfig = {};

module.exports = nextConfig;

async () => {
  try {
    const { initOpenNextCloudflareForDev } = await import(
      "@opennextjs/cloudflare"
    );
    initOpenNextCloudflareForDev();
  } catch (error) {
    console.error(error);
  }
};
