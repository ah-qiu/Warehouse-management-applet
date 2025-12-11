# 通用小程序模板使用指南

本小程序是一个通用的库存进销存管理模板。您可以根据以下步骤快速适配您公司的需求。

## 1. 基础配置
打开 `miniprogram/config.js` 文件，修改以下配置项：

```javascript
module.exports = {
  appName: "您的应用名称",       // 例如：XX库存管理
  companyName: "您的公司名称",   // 例如：XX科技有限公司
  envId: "您的云开发环境ID"      // 替换为您的云开发环境ID
};
```

## 2. 云开发环境配置
1. 打开微信开发者工具，点击“云开发”按钮。
2. 复制您的环境 ID。
3. 将环境 ID 填入 `miniprogram/config.js` 中的 `envId` 字段。
4. 同时打开 `project.config.json`，在 `miniprogramRoot` 下方确认 `cloudfunctionRoot` 配置正确。

## 3. AppID 配置
打开 `project.config.json` 文件，找到 `appid` 字段，填入您小程序的真实 AppID。

## 4. 部署云函数
1. 在微信开发者工具中，右键点击 `cloudfunctions` 文件夹。
2. 选择当前环境。
3. 右键点击每个云函数文件夹（如 `inventory`, `getOptions` 等），选择“上传并部署：云端安装依赖”。

## 5. 数据库初始化 (详细配置)
本系统依赖 5 个数据集合。请在云开发控制台 -> 数据库中创建，并配置相应的索引。

### 1. Products (库存主表)
- **集合名称**: `Products`
- **说明**: 存储产品和包装物的实时库存。
- **权限设置**: 自定义权限 (读: 所有用户, 写: 仅创建者/管理员)

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `model` | string | 是 | 产品型号 |
| `category` | string | 是 | 产品类别 |
| `item_type` | string | 否 | 物品类型 ("product" / "package") |
| `unit` | string | 否 | 单位 (默认"公斤") |
| `total_stock_kg` | number | 否 | 当前总库存 |
| `warning_threshold` | number | 否 | 预警阈值 (默认 100) |
| `update_time` | number | 否 | 更新时间戳 |

### 2. LedgerRecords (出入库台账)
- **集合名称**: `LedgerRecords`
- **说明**: 出入库流水记录。
- **权限设置**: 仅创建者/管理员可读写

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `product_category` | string | 产品类别 |
| `product_model` | string | 产品型号 |
| `batch_number` | string | 产品批号 (仅产品) |
| `action_type` | string | "in" (入库) 或 "out" (出库) |
| `nature` | string | 出入库性质 (如"采购入库") |
| `quantity_kg` | number | 数量 (公斤) |
| `package_spec` | string | 包装规格 (仅包装物) |
| `current_stock_snapshot`| number | 当时库存快照 |
| `product_id` | string | 关联 Products 表 _id |

### 3. Options (通用选项配置)
- **集合名称**: `Options`
- **说明**: 下拉菜单配置字典。
- **权限设置**: 所有用户可读

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `config_id` | string | **主键** (如 "category_list") |
| `items` | array | 选项字符串数组 |

**需初始化数据 (config_id):**
- `category_list`, `inbound_nature_list`, `outbound_nature_list`
- `package_category_list`, `package_spec_list` (如需包装物功能)

### 4. BatchTags (批次标签)
- **集合名称**: `BatchTags`
- **说明**: 批次特定备注。

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `category` | string | **主索引** |
| `model` | string | 产品型号 |
| `batch` | string | 批号 |
| `tags` | array | 标签数组 |

### 5. users (权限管理)
- **集合名称**: `users`
- **说明**: 用户角色管理。

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `role` | string | 角色 ("admin" 为管理员) |
| `_openid` | string | 用户 OpenID (系统自动维护) |

> ⚠️ **关键步骤**: 部署完成后，请手动在 `users` 表中添加一条记录，设置 `role: "admin"` 且 `_openid` 为您的 OpenID，以获取管理员权限。

## 注意事项
- 如果您需要更换 TabBar 的图标，请替换 `miniprogram/images/tabbar` 下的图片，并确保文件名保持一致，或者修改 `app.json` 中的路径。
