# 积分直充与会员钱包冻结设计

> 日期：2026-06-22  
> 状态：待用户评审  
> 范围：固定档位积分直充、会员弹窗入口、会员资格校验、钱包冻结/恢复/清零、专业版不被体验版降级  
> 非范围：任意金额直充、自动续费、退款自动回滚、积分兑换码、活动积分、企业版自助支付

## 1. 产品结论

积分直充是会员之外的补充购买线路，用来满足“会员还没必要续很久，只想补一点积分”的用户诉求。直充只增加钱包积分，不赠送任何会员权益，不延长会员有效期，也不改变会员等级。

会员资格是钱包消费资格的总闸门。只要组织会员断档到期，钱包里的积分整体冻结；重新开通会员后，冻结积分恢复可用；冻结满一年仍未续费，则清零冻结积分并写入可追溯账本。

积分来源仍然要记录清楚。会员赠送、积分直充、历史积分包都要保留来源、订单、套餐快照和账本事实，方便后台审计、用户流水和运营统计。可消费性不按来源分支判断，而由当前会员状态决定。

## 2. 核心规则

### 2.1 积分直充

- 直充档位是固定档位，由后台管理配置。
- 直充档位不允许前端任意输入金额或积分数。
- 非会员不能直充积分。后端创建订单前必须校验组织当前存在有效会员；前端在直充页提示先开通会员。
- 直充支付成功后只发放积分到账，不发会员权益，不写 `organization_entitlements`，不更新会员周期。
- 直充积分进入同一个组织钱包，账本记录来源为支付订单，并在 metadata 中标记直充档位。

### 2.2 钱包冻结

- 会员有效时，钱包积分可以正常预扣、消费、释放。
- 会员断档到期时，钱包里未使用的积分整体冻结，不区分会员赠送积分和直充积分。
- 冻结期间不能发起新的积分消费。生成、导出等需要积分的能力应返回会员续费提示。
- 冻结后一年内重新开通会员，冻结积分恢复为可用积分。
- 冻结满一年仍未重新开通会员，冻结积分清零，写入 `expire` 类型账本。
- 续费或升级造成会员有效期延长时，钱包积分继续可用，不发生冻结。

### 2.3 会员购买调整

- 专业版有效期间购买体验版，不降级，不缩短专业版周期，不回收专业权益。
- 这种情况下只发放体验版套餐配置的赠送积分。
- 当前会员状态和有效期继续以专业版为准。
- 体验版赠送积分进入同一个钱包，后续也受钱包冻结总规则约束。

## 3. 推荐实现方案

推荐复用现有 `credit_packages` 支付链路，并增加会员钱包冻结层。

理由：

- 固定档位直充和当前积分包模型天然一致。
- 现有支付意图、provider 回调、`payment.succeeded` outbox、积分账本发放都能复用。
- 只需要把“哪些积分包是直充档位”和“购买前必须是会员”表达清楚，不需要新增一套商品类型。
- 会员钱包冻结是全局规则，应放在积分消费资格和会员维护任务层，而不是散落到每种积分来源里。

不推荐新增 `credit_direct_recharge` 商品类型。它语义更干净，但会新增订单 shape、consumer 分支、后台配置模型、对账修复分支和更多测试面。当前固定档位诉求用 `credit_packages` 已足够。

## 4. 数据模型

### 4.1 直充档位

复用 `credit_packages`：

- `credits`：基础积分。
- `gift_credits`：直充默认应为 0，除非未来明确做直充促销。
- `amount_minor` / `currency`：价格。
- `status`、`valid_from`、`valid_until`：上下架和生效窗口。
- `metadata_json.kind = "direct_recharge"`：标记为积分直充档位。
- `metadata_json.displayGroup`、`sortOrder` 等可继续服务前端展示。

后台管理需要能配置直充档位，并写入审计日志。历史订单必须使用下单时的 `product_snapshot_json`，后台改价不影响历史订单。

### 4.2 钱包冻结字段

在 `organizations` 或独立钱包表中增加冻结读模型字段，推荐先放在 `organizations`：

- `credit_frozen_cached`：当前冻结积分总额。
- `credit_frozen_at`：最近一次冻结时间。
- `credit_frozen_until`：清零期限，通常为冻结时间加一年。

现有 `credit_balance_cached` 继续表示可用积分余额，`credit_reserved_cached` 表示已预扣积分。冻结时把可用积分从 `credit_balance_cached` 搬到 `credit_frozen_cached`；恢复时反向搬回。

### 4.3 积分批次

继续使用 `credit_lots` 记录来源批次。为了支持冻结和恢复，建议新增或复用状态字段：

- `status`: `active` / `frozen` / `expired`
- `frozen_at`
- `frozen_until`

冻结钱包时，把仍有 `available_amount` 的批次标为 `frozen`。恢复会员时，未超过 `frozen_until` 的批次恢复为 `active`。满一年清零时，将仍冻结的可用量写为 expired。

如果第一步想降低迁移量，也可以先只冻结组织级余额，并在消费入口统一按会员状态拦截。批次状态仍建议补上，因为它让后续审计和清零更清楚。

## 5. 后端流程

### 5.1 拉取直充档位

`GET /api/billing/packages` 可以继续返回积分包。前端根据 `metadata.kind = "direct_recharge"` 展示在“积分直充”页。

如果后台以后需要同时保留非直充积分包，可增加 query 参数：

```text
GET /api/billing/packages?kind=direct_recharge
```

### 5.2 创建直充订单

`POST /api/billing/orders` 复用现有接口，但在创建订单前增加校验：

1. 找到有效 `credit_package`。
2. 如果套餐 `metadata.kind = "direct_recharge"`，校验组织当前有有效会员。
3. 非会员返回 `membership_required_for_credit_recharge`。
4. 会员有效则创建 `product_type = "credit_package"` 订单，订单快照记录直充 metadata。

为了避免影响历史测试和内部补账，普通非直充积分包是否也要求会员，可以由 metadata 控制；产品当前前端只开放直充入口，用户侧应全部要求会员。

### 5.3 支付成功发积分

支付成功仍走当前链路：

```text
provider callback
  -> Commerce/Payment 标记订单 paid
  -> 写 payment.succeeded outbox
  -> credit.payment-succeeded 消费
  -> grantCreditsInTransaction
  -> 创建 credit_lots
```

直充不会进入 membership consumer，不会写会员周期和会员权益。

### 5.4 会员到期冻结钱包

会员维护任务扫描断档到期的组织：

1. 判断组织没有任何有效会员周期。
2. 锁定组织钱包和相关积分批次。
3. 将 `credit_balance_cached` 中未预扣可用积分冻结到 `credit_frozen_cached`。
4. 将对应 `credit_lots.available_amount` 标记为冻结状态。
5. 写一条或多条账本/审计记录，原因是 `membership_lapsed_wallet_frozen`。
6. 更新会员订阅状态为 `expired`。

如果有正在预扣的积分，第一版不强行冻结 reserved 部分。等任务结算释放后，如果会员仍过期，再进入冻结。

### 5.5 会员续费恢复钱包

会员支付成功并产生有效周期后：

1. 会员 consumer 更新会员周期。
2. 检查组织是否存在未超过一年清零期的冻结积分。
3. 将冻结积分恢复到 `credit_balance_cached`。
4. 恢复对应批次为 active。
5. 清空或更新冻结读模型字段。
6. 写审计记录，原因是 `membership_renewed_wallet_restored`。

### 5.6 冻结满一年清零

会员维护任务扫描 `credit_frozen_until <= now` 且仍未恢复的组织：

1. 将冻结积分写入 `expire` 账本。
2. 将冻结批次的 `available_amount` 转入 `expired_amount`。
3. 将 `credit_frozen_cached` 清零。
4. 写审计记录，原因是 `membership_lapse_frozen_credit_expired`。

## 6. 前端体验

现有会员弹窗增加一个顶部切换：

- `会员订阅`
- `积分直充`

会员订阅页保持当前会员套餐卡片。积分直充页展示后台配置的直充档位卡片：

- 积分数量
- 价格
- 适用说明，如“仅增加积分，不延长会员有效期”
- 微信支付和支付宝支付按钮

非会员进入积分直充页时：

- 展示空态或禁用卡片。
- 文案提示“开通会员后可充值积分，积分随会员资格可用”。
- 主按钮跳回会员订阅页。

直充支付弹窗可以复用现有会员支付弹窗结构，但文案应改成积分订单：

- 标题：确认积分充值订单
- 状态：支付成功后积分到账
- 成功态：积分已到账
- 不展示会员权益生效文案

## 7. 错误处理

- `membership_required_for_credit_recharge`：非会员创建直充订单。
- `credit_package_not_found`：档位不存在或不可售。
- `order_not_payable`：订单不属于当前组织、已过期或状态不可支付。
- `payment_succeeded_payload_mismatch`：回调事实与订单/支付意图不匹配。
- `wallet_frozen_membership_required`：会员断档时发起积分消费。
- `wallet_freeze_reserved_credits_pending`：到期冻结时存在预扣积分，维护任务稍后重试。

所有错误不应泄露支付密钥、provider 原始敏感字段或 `.env` secret。

## 8. 测试重点

### 8.1 后端

- 有效会员可以创建直充订单。
- 非会员创建直充订单返回 `membership_required_for_credit_recharge`。
- 直充支付成功只增加积分，不写会员周期、不写会员权益。
- 直充重复 provider callback 不重复发积分。
- 专业版有效期间购买体验版，只发体验版赠送积分，不降级，不改专业版到期时间。
- 会员断档到期后钱包可用积分冻结。
- 冻结期间积分消费被拒绝。
- 会员一年内续费后冻结积分恢复可用。
- 冻结满一年未续费后冻结积分清零并写 expire 账本。
- 存在 reserved credits 时冻结任务不破坏预扣结算。

### 8.2 前端

- 会员弹窗能在“会员订阅 / 积分直充”之间切换。
- 直充页只展示后台配置的直充档位。
- 非会员看到先开会员提示，不能下直充订单。
- 会员点击直充档位能创建订单和支付意图。
- 支付成功后展示积分到账状态，而不是会员开通状态。

## 9. 验收标准

- 管理台能配置固定积分直充档位。
- Web 会员弹窗中存在积分直充切换入口。
- 非会员无法购买直充积分，并被引导先开通会员。
- 有效会员支付直充档位后，钱包积分增加，流水可查。
- 直充不发权益、不延会员、不改变会员等级。
- 会员断档时钱包积分整体冻结，续费后恢复。
- 冻结满一年未续费的积分被清零并可审计。
- 专业版用户购买体验版不会降级，只获得体验版赠送积分。
