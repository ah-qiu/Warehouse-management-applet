// cloudfunctions/exportExcel/index.js
const cloud = require('wx-server-sdk')
const nodeXlsx = require('node-xlsx')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
    try {
        const { startDate, endDate, itemType } = event
        const _ = db.command

        // 1. Build Query
        let query = db.collection('LedgerRecords')

        // Only filter if BOTH dates are provided and valid strings
        // Frontend now controls this via 'enableDateFilter' logic (only sending if active)
        if (startDate && endDate && typeof startDate === 'string' && typeof endDate === 'string') {
            query = query.where({
                operate_date: _.gte(startDate).and(_.lte(endDate + ' 23:59:59'))
            })
        }

        // Filter by Item Type
        if (itemType && itemType !== 'all') {
            query = query.where({
                item_type: itemType
            })
        }

        // 2. Fetch Records (Loop for >100)
        // Need to count first with the same query filter
        const countResult = await query.count()
        const total = countResult.total
        const MAX_LIMIT = 100
        const batchTimes = Math.ceil(total / MAX_LIMIT)
        const tasks = []

        for (let i = 0; i < batchTimes; i++) {
            const promise = query
                .orderBy('product_category', 'asc')
                .orderBy('product_model', 'asc')
                .orderBy('operate_date', 'asc')
                .skip(i * MAX_LIMIT)
                .limit(MAX_LIMIT)
                .get()
            tasks.push(promise)
        }

        const results = await Promise.all(tasks)
        let records = []
        results.forEach(res => {
            records = records.concat(res.data)
        })

        // 2. Format Data for Excel
        // Header: 产品类别 | 产品型号 | 产品批号 | 包装规格 | 入库日期 | 入库数量(公斤) | 入库性质 | 出库日期 | 出库数量(公斤) | 出库性质 | 库存数量(公斤) | 操作人
        const tableData = [
            ['产品类别', '产品型号', '产品批号', '包装规格', '入库日期', '入库数量(公斤)', '入库性质', '出库日期', '出库数量(公斤)', '出库性质', '库存数量(公斤)', '操作人']
        ]

        records.forEach(record => {
            const isIn = record.action_type === 'in'
            const row = [
                record.product_category,
                record.product_model,
                record.batch_number,
                record.package_spec,
                isIn ? record.operate_date : '',     // 入库日期
                isIn ? record.quantity_kg : '',      // 入库数量
                isIn ? record.nature : '',           // 入库性质
                !isIn ? record.operate_date : '',    // 出库日期
                !isIn ? record.quantity_kg : '',     // 出库数量
                !isIn ? record.nature : '',          // 出库性质
                record.current_stock_snapshot,       // 库存数量
                record.operator_name || '未知'       // 操作人
            ]
            tableData.push(row)
        })

        // 3. Generate Buffer
        const buffer = nodeXlsx.build([{ name: '进出仓台账', data: tableData }])

        // 4. Upload to Cloud Storage
        const fileName = `excel/ledger_export_${Date.now()}.xlsx`
        const uploadResult = await cloud.uploadFile({
            cloudPath: fileName,
            fileContent: buffer,
        })

        // 5. Get Temp URL
        const urlResult = await cloud.getTempFileURL({
            fileList: [uploadResult.fileID]
        })

        return {
            success: true,
            fileUrl: urlResult.fileList[0].tempFileURL
        }

    } catch (e) {
        return {
            success: false,
            errMsg: e.message
        }
    }
}
