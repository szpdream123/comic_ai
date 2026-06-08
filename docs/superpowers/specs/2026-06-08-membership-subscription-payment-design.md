# 会员订阅支付设计

> 日期：2026-06-08  
> 状态：待评审  
> 范围：体验版会员、专业版会员月/季/年、自助手动续费、会员赠送积分、会员权益开通、会员到期提醒、后台套餐配置  
> 非范围：自动续费、普通积分充值包、兑换码、活动积分、企业版自助支付、用户自助退款、微信/支付宝正式接入

## 1. 产品结论

本轮支付模块从“购买积分包赠送权益”改为“会员订阅支付”。第一版只做会员支付，不做普通积分充值。

自助售卖的会员有两个档位：

| 档位 | 周期 | 购买限制 | 赠送积分 | 第一版强约束权益 |
| --- | --- | --- | --- | --- |
| 体验版会员 | 7 天 | 每个组织只能购买一次 | 后台配置，少量积分 | 基础体验，不开放团队管理，不开放 Seedance 系列免排队 |
| 专业版会员 | 月 / 季 / 年 | 可重复购买，手动续费 | 后台配置 | 团队管理、50 人团队、Seedance 系列当前会员优先模型免排队 |
| 企业版 | 联系商务 | 不走自助支付 | 人工方案 | 人工配置 |

专业版里暂时只把最关键的能力做成真实强约束：

- 专业会员有效期
- 专业会员赠送积分
- 团队管理
- 支持 50 人团队
- Seedance 系列当前会员优先模型免排队

其他权益可以先做后台配置和前端展示，等对应业务能力成熟后再逐个强约束：

- Seedance 折扣
- Happy Horse 折扣
- 全流程 Agent
- 团队资产库
- 团队数据看板

## 2. 核心规则

### 2.1 购买与续费

- 会员按组织生效。主账号购买后，组织获得会员能力；子账号在角色、项目、积分分配范围内使用组织会员能力。
- 体验版会员按组织限购一次。
- 体验版升级专业版立即生效，体验版剩余时间不折算。
- 专业版月/季/年都是手动续费，不做自动扣款。
- 专业版续费和切换周期统一按顺延处理：

```text
newExpiresAt = max(currentProfessionalExpiresAt, paidAt) + purchasedDuration
```

如果会员已过期，则从支付成功时间重新开通；如果未过期，则从当前到期时间继续顺延。

### 2.2 会员赠送积分

- 每次支付成功一次性发放当期会员赠送积分，不做月度分批发放。
- 赠送积分数量由后台套餐配置决定。
- 会员赠送积分必须按批次记录，有独立 `expires_at`。
- 体验版赠送积分随体验版到期。
- 专业版月卡赠送积分随月卡到期，季卡随季卡到期，年卡随年卡到期。
- 专业版续费后，组织内未过期的专业会员赠送积分顺延到新的专业会员到期时间。
- 已过期积分不复活。
- 会员到期时，未使用的会员赠送积分立即失效。
- 消耗积分时，优先扣减最早过期的积分批次。

体验版升级专业版时，体验版剩余时间不折算；体验版赠送积分也不因为升级而自动顺延。专业版支付成功会发放新的专业版赠送积分。

### 2.3 到期后的产品表现

- 团队、项目、资产、历史数据保留。
- 到期后锁定会员功能的新建和继续使用能力。
- 到期后不删除子账号，不删除团队资产，不删除历史项目。
- 用户续费后恢复专业能力。

### 2.4 提醒

第一版不做短信提醒。

- 前端持续展示会员状态和到期时间。
- 站内提醒时间点：到期前 7 天、3 天、1 天，到期当天。
- 到期后不再额外推送提醒，主要靠会员状态和锁定入口引导续费。

### 2.5 退款

第一版不做用户自助退款入口。虚拟商品支付成功后默认不支持自助退款，特殊情况走客服和后台人工处理。

后台人工处理必须留痕，至少记录：

- 操作人
- 原订单
- 处理原因
- 是否撤销会员周期
- 是否扣回未用赠送积分
- 是否只是备注，不执行自动回滚

## 3. 推荐架构

推荐方案：新增独立会员域，支付域继续只负责收款事实。

```text
Admin 配置会员套餐
  -> Web 展示套餐并创建会员订单
  -> Commerce/Payment 创建支付意图
  -> Provider 回调
  -> Commerce/Payment 验证并发出 payment.succeeded
  -> Membership 消费 payment.succeeded，开通/续期会员
  -> Membership 发出 membership.period.started
  -> Credit/Billing 消费 membership.period.started，发放会员赠送积分批次
  -> Web 刷新会员状态、积分余额、权益锁定状态
```

边界原则：

- `Commerce/Payment` 只证明“钱收到了”。
- `Membership` 负责“哪个组织的会员周期变了、哪些权益应该打开”。
- `Credit/Billing` 负责“积分批次、过期、扣减、账本”。
- `Model Gateway` 负责“Seedance 系列任务如何排队和执行”。
- `Admin` 负责“套餐配置、人工处理、运营可见性”。

## 4. 数据模型

### 4.1 会员套餐

新增 `membership_plans`。

| 字段 | 含义 |
| --- | --- |
| `id` | 套餐 ID |
| `code` | 稳定编码，如 `trial_7d`、`professional_monthly` |
| `tier` | `trial` / `professional` |
| `period_unit` | `day` / `month` / `quarter` / `year` |
| `period_count` | 周期数量，体验版为 7 天，月卡为 1 月 |
| `amount_minor` | 售价，单位分 |
| `currency` | `CNY` |
| `gift_credits` | 支付成功赠送积分 |
| `seat_limit` | 专业版默认 50 |
| `entitlements_json` | 权益 key 列表 |
| `priority_rules_json` | 模型优先规则，如 `{ "modelFamilies": ["seedance"] }` |
| `display_metadata_json` | 前端展示文案、促销标签、排序、角标 |
| `status` | `active` / `inactive` / `archived` |
| `valid_from` / `valid_until` | 套餐配置生效窗口 |

套餐修改只影响新订单。历史订单必须使用下单时的套餐快照。

### 4.2 商业订单

现有 `billing_orders` 目前强绑定 `credit_packages`。会员支付不应该继续伪装成积分包。

建议把 `billing_orders` 升级为通用商业订单：

- 新增 `product_type`，第一版会员订单使用 `membership_plan`。
- 新增 `membership_plan_id`。
- 新增 `product_snapshot_json`，保存下单瞬间的会员套餐快照。
- 保留现有支付意图、 provider 回调、风控、对账、outbox 能力。

现有 `payment_intents.order_id -> billing_orders.id` 可以继续复用，这样支付基础设施不用推倒重来。

### 4.3 组织会员订阅

新增 `organization_membership_subscriptions`，表示一个组织当前会员状态。

| 字段 | 含义 |
| --- | --- |
| `organization_id` | 组织 |
| `status` | `none` / `trialing` / `active` / `expired` |
| `current_tier` | 当前档位 |
| `current_period_start_at` | 当前周期开始 |
| `current_period_end_at` | 当前周期结束 |
| `trial_used_at` | 体验版是否已用 |
| `latest_order_id` | 最近一次支付订单 |
| `updated_at` | 更新时间 |

### 4.4 会员周期记录

新增 `membership_periods`，记录每次支付成功产生的周期事实。

| 字段 | 含义 |
| --- | --- |
| `id` | 周期 ID |
| `organization_id` | 组织 |
| `order_id` | 来源订单 |
| `plan_id` | 来源套餐 |
| `tier` | `trial` / `professional` |
| `period_start_at` | 本次周期开始 |
| `period_end_at` | 本次周期结束 |
| `gift_credits` | 本次赠送积分 |
| `plan_snapshot_json` | 套餐快照 |
| `status` | `active` / `expired` / `manually_revoked` |

这个表是后续账务、客服、排查问题的事实来源。

### 4.5 积分批次

现有积分账本能做总额增减，但会员积分过期需要批次级数据。

新增 `credit_lots`：

| 字段 | 含义 |
| --- | --- |
| `organization_id` | 组织 |
| `source_type` | `membership_period` |
| `source_id` | `membership_periods.id` |
| `grant_ledger_entry_id` | 对应账本 grant |
| `amount_total` | 批次总积分 |
| `amount_available` | 可用积分 |
| `amount_reserved` | 已预扣积分 |
| `amount_consumed` | 已消耗积分 |
| `amount_expired` | 已过期积分 |
| `expires_at` | 批次过期时间 |
| `metadata_json` | 套餐、周期、订单快照 |

新增 `credit_reservation_lot_allocations`，把一次生成任务的预扣和具体积分批次绑定起来。这样任务成功、失败、释放积分时，都能回到同一批次。

## 5. 事件流

### 5.1 支付成功

`payment.succeeded` 是根事件。

对于 `product_type = membership_plan` 的订单：

1. `membership.payment-succeeded` 消费事件。
2. 校验订单已支付、套餐快照存在、体验版未被该组织购买过。
3. 计算会员周期。
4. 写入 `membership_periods`。
5. 更新 `organization_membership_subscriptions`。
6. 更新 `organization_entitlements` 和 `team_plan_limits`。
7. 发出 `membership.period.started`。

已有 `credit.payment-succeeded` 消费者必须限制为旧的积分包订单，不能对会员订单直接发积分，避免重复发放。

### 5.2 会员积分发放

`credit.membership-period-started` 消费 `membership.period.started`：

1. 读取会员周期和套餐快照。
2. 写一条 grant ledger entry。
3. 创建 `credit_lots`，`expires_at = membership_period.period_end_at`。
4. 更新组织积分缓存。
5. 幂等处理重复事件。

### 5.3 续费积分顺延

专业版续费成功后：

1. 计算新的专业会员到期时间。
2. 找出组织内未过期、未完全消耗的专业会员积分批次。
3. 将这些批次的 `expires_at` 顺延到新的专业会员到期时间。
4. 新支付产生的新积分批次也使用新的专业会员到期时间。

体验版积分不参与专业版续费顺延。

### 5.4 到期处理

到期 worker 定期扫描：

- 到期会员订阅
- 到期会员周期
- 到期积分批次
- 需要发送的站内提醒

到期时：

- 会员状态变为 `expired`
- 强约束权益变为不可用
- 未使用的会员积分批次转为 expired
- 组织可用积分缓存扣减过期部分

## 6. Seedance 系列免排队

不要把权益写死成 `Seedance 2.0`。当前最新模型是 2.0，但后续字节升级后，代码不应该改。

设计方式：

- 会员权益 key 保持通用，如 `priority_generation`。
- 会员套餐的 `priority_rules_json` 配置模型族，例如 `seedance`。
- 模型配置里标记模型族和是否支持会员优先，例如：

```json
{
  "modelFamily": "seedance",
  "membershipPriorityEligible": true
}
```

队列判断：

1. 当前组织有有效专业会员。
2. 当前组织有 `priority_generation` 权益。
3. 当前任务使用的模型属于套餐允许的 model family。
4. 当前模型配置允许会员优先。

满足条件时，任务以更高队列优先级进入 BullMQ。免排队只表示平台侧优先调度，不绕过供应商 RPM、供应商并发、租户安全限制、积分预扣、幂等保护。

前端文案可以展示“Seedance 2.0 免排队”，但这个展示名来自模型配置，不是写死在会员权益代码里。

## 7. 后台管理

在现有后台管理平台新增会员管理能力。

### 7.1 套餐配置

运营可配置：

- 体验版是否启用
- 专业版月 / 季 / 年是否启用
- 价格
- 赠送积分
- 周期
- 权益列表
- Seedance 系列优先规则
- 展示文案、促销角标、排序
- 上架 / 下架 / 归档

所有套餐变更写审计日志。订单创建时写入套餐快照，避免改价影响历史订单。

### 7.2 订单与会员状态

后台可查看：

- 会员订单
- 支付状态
- 当前会员状态
- 当前到期时间
- 已发放积分批次
- 体验版是否已使用
- 最近提醒记录

### 7.3 人工处理

后台支持人工处理特殊情况：

- 手动延长会员
- 手动撤销会员权益
- 补发会员赠送积分
- 标记客服退款处理备注
- 记录人工操作审计

第一版不做自动退款回滚。人工处理可以修改会员和积分，但必须通过后台审计动作完成。

## 8. 前端体验

创作者端会员弹窗：

- 体验版会员
- 专业版月卡
- 专业版季卡
- 专业版年卡
- 企业版联系商务

显示内容来自后台配置：

- 价格
- 赠送积分
- 周期
- 权益文案
- 促销标签
- 当前会员状态
- 到期时间

购买后：

1. 前端创建会员订单。
2. 创建支付意图。
3. 跳转或展示支付动作。
4. 支付完成后轮询订单和会员状态。
5. 状态生效后刷新积分、会员状态、团队功能锁、Seedance 优先提示。

## 9. 支付渠道

第一阶段先用现有 PayLab / 本地模拟支付打通全链路。

正式微信和支付宝接入只替换 provider adapter，不改变会员、积分、权益核心业务流。

## 10. 测试重点

- 体验版一个组织只能购买一次。
- 专业版月/季/年支付成功后正确开通或顺延。
- 专业版续费后未过期专业会员积分顺延到新到期时间。
- 已过期会员积分不会被续费复活。
- 会员到期后未使用积分立即失效。
- 积分消耗按最早过期批次优先。
- 到期后团队数据保留，但团队新增能力锁定。
- 专业会员 Seedance 系列任务获得队列优先级。
- Seedance 优先不绕过 provider limiter。
- 修改后台套餐后，历史订单仍按订单快照执行。
- 重复 provider callback 不重复开通会员、不重复发积分。
- 到期前 7 天、3 天、1 天、当天只生成一次站内提醒。

## 11. 验收标准

- 管理台能配置体验版和专业版月/季/年套餐。
- Web 端能展示后台配置的会员套餐并创建会员订单。
- PayLab / 本地模拟支付成功后，会员状态、权益、赠送积分全部生效。
- 用户续费后到期时间按顺延规则计算。
- 到期后会员权益锁定，历史数据保留。
- Seedance 系列会员优先逻辑通过模型族配置驱动，不写死版本号。
- 整条链路具备幂等性、审计记录和可排查的订单/会员/积分事实表。
