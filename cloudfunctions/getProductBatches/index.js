// cloudfunctions/getProductBatches/index.js
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

exports.main = async (event, context) => {
    const { category, model } = event

    if (!category || !model) {
        return { success: false, errMsg: 'Missing parameters' }
    }

    try {
        const res = await db.collection('LedgerRecords')
            .aggregate()
            .match({
                product_category: category,
                product_model: model
            })
            .group({
                _id: '$batch_number',
                in_qty: $.sum($.cond({
                    if: $.eq(['$action_type', 'in']),
                    then: '$quantity_kg',
                    else: 0
                })),
                out_qty: $.sum($.cond({
                    if: $.eq(['$action_type', 'out']),
                    then: '$quantity_kg',
                    else: 0
                }))
            })
            .lookup({
                from: 'BatchTags',
                let: { batch_no: $.ifNull(['$_id', '']) },
                pipeline: $.pipeline()
                    .match(_.expr($.and([
                        $.eq(['$category', category]),
                        $.eq(['$model', model]),
                        $.eq(['$batch', '$$batch_no'])
                    ])))
                    .project({
                        tags: 1,
                        _id: 0
                    })
                    .done(),
                as: 'tagInfo'
            })
            .project({
                batch: '$_id',
                stock: $.subtract(['$in_qty', '$out_qty']),
                tags: $.ifNull([$.arrayElemAt(['$tagInfo.tags', 0]), []])
            })
            .match({
                stock: $.gt(0)
            })
            .end()

        return {
            success: true,
            data: res.list
        }
    } catch (e) {
        console.error(e)
        return {
            success: false,
            errMsg: e.message
        }
    }
}
