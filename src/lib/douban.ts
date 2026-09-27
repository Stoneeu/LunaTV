import { getConfig } from './config';

/**
 * 通用的豆瓣数据获取函数
 * @param url 请求的URL
 * @returns Promise<T> 返回指定类型的数据
 */
export async function fetchDoubanData<T>(url: string): Promise<T> {
  // 添加超时控制
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Douban request timeout'));
      controller.abort();
    }, 10000);
  });

  // 设置请求选项，包括信号和头部
  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      Referer: 'https://movie.douban.com/',
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://movie.douban.com',
    },
  };

  try {
    return await Promise.race([
      (async () => {
        const config = await getConfig();
        const target = new URL(url);
        // Match the server's configured CDN policy used by the web client.
        // Only rewrite known Douban hosts; never turn this into an arbitrary proxy.
        if (['m.douban.com', 'movie.douban.com'].includes(target.hostname)) {
          if (config.SiteConfig.DoubanProxyType === 'cmliussss-cdn-tencent') {
            target.hostname = target.hostname.replace(
              'douban.com',
              'douban.cmliussss.net'
            );
          } else if (
            config.SiteConfig.DoubanProxyType === 'cmliussss-cdn-ali'
          ) {
            target.hostname = target.hostname.replace(
              'douban.com',
              'douban.cmliussss.com'
            );
          }
        }
        const response = await fetch(target.toString(), fetchOptions);
        if (!response.ok)
          throw new Error(`HTTP error! Status: ${response.status}`);
        return response.json() as Promise<T>;
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}
