/**
 * Worker isolation configuration
 * 用于隔离线上worker和本地任务
 * 基于请求域名自动识别环境，无需配置
 */

export interface WorkerIsolationConfig {
  /** 当前worker的环境标识 */
  workerEnvironment: 'production' | 'local' | 'staging';
  /** 是否启用worker隔离 */
  enableIsolation: boolean;
  /** worker ID前缀 */
  workerIdPrefix: string;
  /** 检测到的域名或IP */
  detectedHost: string;
}

/**
 * 检测当前是否为本地环境
 * 基于常见的本地开发域名/IP特征
 */
function isLocalEnvironment(host: string | undefined): boolean {
  if (!host) return false;

  const normalizedHost = host.toLowerCase().trim();

  // 本地IP地址
  const localIps = [
    '127.0.0.1',
    'localhost',
    '0.0.0.0',
    '::1', // IPv6 localhost
  ];

  if (localIps.some(ip => normalizedHost.includes(ip))) {
    return true;
  }

  // 192.168.x.x, 10.x.x.x, 172.16-31.x.x 内网IP段
  if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/i.test(normalizedHost)) {
    return true;
  }

  // .local 域名
  if (normalizedHost.endsWith('.local')) {
    return true;
  }

  // ngrok, localtunnel 等本地调试工具
  if (/ngrok|localtunnel|localhost\.run/i.test(normalizedHost)) {
    return true;
  }

  return false;
}

/**
 * 检测当前是否为预发布环境
 */
function isStagingEnvironment(host: string | undefined): boolean {
  if (!host) return false;

  const normalizedHost = host.toLowerCase().trim();

  // 常见的staging域名特征
  const stagingPatterns = [
    'staging',
    'stg',
    'pre',
    'preprod',
    'test',
    'uat',
    'dev', // dev.example.com
  ];

  return stagingPatterns.some(pattern => normalizedHost.includes(pattern));
}

/**
 * 从环境变量和请求上下文解析worker隔离配置
 * 优先级：显式配置 > HOST检测 > NODE_ENV > 默认local
 */
export function resolveWorkerIsolationConfig(
  env: NodeJS.ProcessEnv,
  requestHost?: string,
): WorkerIsolationConfig {
  // 优先使用显式配置（用于特殊场景）
  const explicitEnv = env.WORKER_ENVIRONMENT?.trim().toLowerCase();
  if (explicitEnv === 'production' || explicitEnv === 'staging' || explicitEnv === 'local') {
    const workerIdPrefix = explicitEnv === 'local'
      ? `local-${env.HOSTNAME || env.COMPUTERNAME || 'dev'}-`
      : `${explicitEnv}-`;

    return {
      workerEnvironment: explicitEnv,
      enableIsolation: true,
      workerIdPrefix,
      detectedHost: requestHost || env.HOST || 'unknown',
    };
  }

  // 自动检测：优先使用 HOST 环境变量
  const host = requestHost || env.HOST || env.PUBLIC_URL || '';
  let workerEnvironment: WorkerIsolationConfig['workerEnvironment'] = 'local';

  if (isLocalEnvironment(host)) {
    workerEnvironment = 'local';
  } else if (isStagingEnvironment(host)) {
    workerEnvironment = 'staging';
  } else if (host) {
    // 有域名但不是本地/staging，判定为生产环境
    workerEnvironment = 'production';
  } else {
    // 没有域名信息，回退到NODE_ENV判断
    const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
    if (nodeEnv === 'production') {
      workerEnvironment = 'production';
    } else if (nodeEnv === 'staging') {
      workerEnvironment = 'staging';
    }
  }

  // 生成worker ID前缀
  const workerIdPrefix = workerEnvironment === 'local'
    ? `local-${env.HOSTNAME || env.COMPUTERNAME || 'dev'}-`
    : `${workerEnvironment}-`;

  return {
    workerEnvironment,
    enableIsolation: true, // 默认启用隔离
    workerIdPrefix,
    detectedHost: host || 'unknown',
  };
}

/**
 * 生成带环境标识的worker ID
 */
export function buildWorkerIdWithEnvironment(
  baseName: string,
  config: WorkerIsolationConfig,
): string {
  if (!config.enableIsolation) {
    return baseName;
  }
  return `${config.workerIdPrefix}${baseName}`;
}

/**
 * 从任务快照中提取创建时的域名信息
 */
function extractTaskCreationHost(taskSnapshot: Record<string, unknown>): string | undefined {
  // 优先使用显式的环境标签
  const explicitEnv = taskSnapshot.workerEnvironment as string | undefined;
  if (explicitEnv) return explicitEnv;

  // 尝试从请求来源提取域名
  const requestHost = taskSnapshot.requestHost as string | undefined;
  if (requestHost) return requestHost;

  // 尝试从创建者信息提取
  const createdFrom = taskSnapshot.createdFrom as string | undefined;
  if (createdFrom) return createdFrom;

  return undefined;
}

/**
 * 判断任务的创建环境
 */
function detectTaskEnvironment(taskSnapshot: Record<string, unknown>): 'production' | 'local' | 'staging' | 'unknown' {
  const host = extractTaskCreationHost(taskSnapshot);

  if (!host) return 'unknown';

  // 如果是显式环境标签，直接返回
  if (host === 'production' || host === 'local' || host === 'staging') {
    return host;
  }

  // 基于域名判断
  if (isLocalEnvironment(host)) {
    return 'local';
  }

  if (isStagingEnvironment(host)) {
    return 'staging';
  }

  return 'production';
}

/**
 * 检查任务是否应该被当前worker处理
 * 基于任务创建时的域名自动判断
 *
 * 隔离策略：
 * - 本地worker: 只处理本地任务（严格隔离）
 * - 线上worker: 处理所有任务（兼容未部署场景）
 */
export function shouldProcessTask(
  taskSnapshot: Record<string, unknown>,
  config: WorkerIsolationConfig,
): boolean {
  if (!config.enableIsolation) {
    return true;
  }

  const taskEnv = detectTaskEnvironment(taskSnapshot);

  // 本地worker的严格隔离策略：只处理本地任务
  if (config.workerEnvironment === 'local') {
    // 只处理明确是本地的任务
    return taskEnv === 'local';
  }

  // 线上/staging worker只处理明确归属自身环境的任务。
  if (config.workerEnvironment === 'production') {
    return taskEnv === 'production';
  }

  if (config.workerEnvironment === 'staging') {
    // staging环境：处理staging和unknown，跳过local
    if (taskEnv === 'local') {
      return false;
    }
    return taskEnv === 'staging' || taskEnv === 'unknown';
  }

  return false;
}

/**
 * 构建任务查询的环境过滤条件
 */
export function buildTaskEnvironmentFilter(
  config: WorkerIsolationConfig,
): { sql: string; params: unknown[] } {
  if (!config.enableIsolation) {
    return { sql: '', params: [] };
  }

  if (config.workerEnvironment === 'production') {
    // 线上worker：只处理明确标记为production的任务。
    return {
      sql: `AND input_snapshot_json->>'workerEnvironment' = $PARAM_INDEX`,
      params: ['production'],
    };
  }

  // 本地/staging worker：只处理对应标签的任务
  return {
    sql: `AND input_snapshot_json->>'workerEnvironment' = $PARAM_INDEX`,
    params: [config.workerEnvironment],
  };
}
