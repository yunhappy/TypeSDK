/**
 * Created by TypeSDK 2016/10/10.
 */
var crypto = require('crypto');
var request = require('request');
var merge = require('merge');
var logicCommon = require('./logicCommon.js');

function convertParamLogin(query,ret)
{
    var org =
    {
        "id" : "0"
        ,"token": ""
        ,"data":""
        ,"sign":""
    };
    var cloned = merge(true, org);
    merge(cloned,query);
    for(var i in cloned)
    {
        //判断参数中是否该有的字段齐全
        if(org[i] == cloned[i] && i != "data" && i != "id")
        {
            return false;
        }

        //判断参数中是否有为空的字段
        if(0 == (cloned[i] + "").replace(/(^s*)|(s*$)/g, "").length && i != "data" && i != "id")
        {
            return false;
        }
    }
    ret.token = cloned.token;
    return true;
}



function callChannelLogin(attrs,params,query,ret,retf)
{
    var cloned = merge(true, params.out_params);
    merge(cloned,query);
    cloned.pid = 1;
    cloned.gid  = attrs.app_id;
    cloned.time = Date.now()/1000;
    cloned.sign = crypto.createHash('md5').update('' + cloned.gid + cloned.time + attrs.secret_key).digest('hex');
    cloned.token = query.token;
    console.log(cloned.gid + cloned.time + attrs.secret_key);
    var options = {
        url: params.out_url,
        method:params.method,
        form: cloned,
        rejectUnauthorized: false,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };
    console.log(options);
    //打点：登录验证
    logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.RelaySDKVerify);
    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var retOut = JSON.parse(body);
            if(retOut.state == '1'){
                //打点：验证成功
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifySuc);
                ret.code = 0;
                ret.msg = "NORMAL";
                ret.id = retOut.data.uid;
                ret.nick = "";
                ret.token = "";
                ret.value = retOut;
            }
            else
            {
                //打点：验证失败
                logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifyErr);
                ret.code =  1;
                ret.msg = "LOGIN User ERROR";
                ret.id = "";
                ret.nick = "";
                ret.token = "";
                ret.value = retOut;
            }
        }
        else
        {
            //打点：验证失败
            logicCommon.sdkMonitorDot(logicCommon.dotType.LoginDot.ChVerifyErr);
            ret.code = 2;
            ret.msg = "OUT URL ERROR";
            ret.value = "";
        }
        retf(ret);
    });
}
function compareOrder(attrs,gattrs,params,query,ret,game,channel,retf){
    var retValue = {};
    retValue.code = query.statusCode  == '0000' ? 0 : 1;
    retValue.id = query.productId;
    retValue.order = query.transactionNo;
    retValue.cporder = query.partnerTransactionNo || '';
    retValue.info = '';
    if(retValue.code!='0'){
        var retDate = {};
        retDate.state = 0;
        retDate.data = null;
        retDate.msg = '失败';
        retf(retDate);
        return;
    }
    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData) {
        if (!hasData) {
            retf('FAILURE');
            return;
        } else {
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);
            logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,1,0,query);
            var options = {
                url: params.verifyurl,
                method: "POST",
                body: retValue,
                json: true
            };
            request(options, function (error, response, body) {
                if(!error && response.statusCode == 200) {
                    var retOut = body;
                    if (typeof retOut.code == 'undefined') {
                        var retDate = {};
                        retDate.state = 0;
                        retDate.data = null;
                        retDate.msg = '失败';
                        retf(retDate);
                        return;
                    }
                    console.log(retOut);
                    if(retOut.code =='0'){
                        if(retOut.Itemid){
                            logicCommon.mapItemLists(attrs,retOut);
                        }
                        if(query.partnerTransactionNo ==retOut.cporder
                            &&query.orderPrice*100>=retOut.amount*0.9
                            &&query.orderPrice*100<=retOut.amount){
                            if(retOut.status=='2'){
                                var retDate = {};
                                retDate.state = 0;
                                retDate.data = null;
                                retDate.msg = '失败';
                                retf(retDate);
                                return;
                            }else if(retOut.status=='4'||retOut.status=='3'){
                                logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.orderPrice*100);
                                var retDate = {};
                                retDate.state = 1;
                                retDate.data = null;
                                retDate.msg = '成功';
                                retf(retDate);
                                return;
                            }else{
                                logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,2,0);
                                var data  = {};
                                data.code = '0000';
                                data.msg = 'NORMAL';
                                retf(data);
                                return;
                            }
                        }else{
                            logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,3,0);
                            var retDate = {};
                            retDate.state = 0;
                            retDate.data = null;
                            retDate.msg = '失败';
                            retf(retDate);
                            return;
                        }
                    }else{
                        var retDate = {};
                        retDate.state = 0;
                        retDate.data = null;
                        retDate.msg = '失败';
                        retf(retDate);
                        return;
                    }
                }else{
                    var retDate = {};
                    retDate.state = 0;
                    retDate.data = null;
                    retDate.msg = '失败';
                    retf(retDate);
                    return;
                }
            });
        }
    });
}
function callGamePay(attrs,gattrs,params,query,ret,retf,game,channel,channelId)
{
    var retValue = {};
    retValue.code =  0;
    retValue.id = query.uid;
    retValue.order = query.oid;
    retValue.cporder = query.doid;
    retValue.info = query.remark;
    logicCommon.getNotifyUrl(retValue.cporder,params,function(hasData) {
        if (!hasData) {
            //打点：其他支付失败
            logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
            retf('FAILURE');
        } else {
            retValue.sign = logicCommon.createSignPay(retValue,gattrs.gkey);
            retValue.gamename = game;
            retValue.sdkname = channel;
            retValue.channel_id = channelId;
            retValue.amount = '' + query.money + '';
            var options = {
                url: params.out_url,
                method: params.method,
                body: retValue,
                json: true
            };
            console.log(options);
            //打点：支付回调通知
            logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PayNotice);
            request(options, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var retOut = body;
                    //日志记录CP端返回
                    console.log(retOut);
                    if (typeof retOut.code == 'undefined'){
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);
                        var retDate = {};
                        retDate.state = 0;
                        retDate.data = null;
                        retDate.msg = '失败';
                        retf(retDate);
                        return;
                    }
                    if (retOut.code == 0)
                    {
                        //打点：服务器正确处理支付成功回调
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.PaySuc);

                        logicCommon.UpdateOrderStatus(game,channel,retValue.cporder,retValue.order,4,query.money);
                        var retDate = {};
                        retDate.state = 1;
                        retDate.data = null;
                        retDate.msg = '成功';
                        retf(retDate);
                    }
                    else{
                        //打点：其他支付失败
                        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);

                        var retDate = {};
                        retDate.state = 0;
                        retDate.data = null;
                        retDate.msg = '失败';
                        retf(retDate);
                    }
                }else
                {
                    //打点：其他支付失败
                    logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);

                    var retDate = {};
                    retDate.state = 0;
                    retDate.data = null;
                    retDate.msg = '失败';
                    retf(retDate);
                }
            });
        }
    });
}

/**
 * 核实外部订单号的唯一性
 * @param
 *      query   请求串Obj
 *      retf    返回校验结果 True 合法|False 不合法
 * */
function checkChOrder(game, channel,attrs, query, retf){
    var isIllegal = false;
    logicCommon.selCHOrderInRedis(channel,query.oid,function(res){
        if(!res || typeof res == "undefined"){
            logicCommon.saveCHOrderInRedis(game, channel, query.doid, query.oid,function(res){
                if(res && typeof res != "undefined"){
                    isIllegal = true;
                    retf(isIllegal);
                }else{
                    retf(isIllegal);
                }
            });
        }else{
            retf(isIllegal);
        }
    });
}

function checkSignPay(attrs,query)
{
    var str = query.time + attrs.app_key + query.oid + query.doid + query.dsid + query.uid + query.money + query.coin;
    var osign = crypto.createHash('md5').update(str).digest('hex');
    console.log(query.sign + " :: " + osign);
    if (query.sign != osign)
    {
        return false;
    }

    return true;
}


function checkOrder()
{
    return false;
}


function CreateChannelOrder(attrs,params,query,ret,retf)
{

    var retErrorData = {};
    var retData = {};
    if(typeof (query.playerid  || query.cporder || query.price) == 'undefined')
    {
        //打点：其他支付失败
        logicCommon.sdkMonitorDot(logicCommon.dotType.PayDot.Error);

        retErrorData.code = -1;
        retErrorData.msg = 'ERROR';
        retf(retErrorData);
    }
    else
    {
        retData.buy_amount = "1";
        retData.app_id = attrs.app_id;
        retData.uid = query.playerid;
        retData.pay_type = "0";
        retData.cp_order_id = query.cporder;
        retData.product_id = "0";
        retData.product_body = "";
        retData.product_subject = "";
        retData.product_unit = "";
        retData.total_price = query.price;
        retData.user_info = "";
        retData.create_time = Date.now();
        retData.sign_type = "md5";

        var str = 'app_id=' + retData.app_id + '&' +
            'buy_amount=' + retData.buy_amount + '&' +
            'cp_order_id=' + retData.cp_order_id + '&' +
            'create_time=' + retData.create_time + '&' +
            'pay_type=' + retData.pay_type + '&' +
            'product_body=' + retData.product_body  + '&' +
            'product_id=' + retData.product_id + '&' +
            'product_per_price=' + retData.total_price + '&' +
            'product_subject=' + retData.product_subject + '&' +
            'product_unit=' + retData.product_unit + '&' +
            'total_price=' +  retData.total_price + '&' +
            'uid=' + retData.uid + '&' +
            'user_info=' + retData.user_info +  ':' + attrs.secret_key;
        var osign = crypto.createHash('md5').update(str).digest('hex');
        var retStr = {};
        retData.sign = osign;
        retStr.code = 0;
        retStr.msg = 'NORMAL';
        retStr.playerid = query.playerid;
        retStr.order = retData.order_id;
        retStr.cporder = retData.order_id;
        retStr.data = retData;
        retf(JSON.stringify(retStr));

    }

}

exports.convertParamLogin = convertParamLogin;
exports.callChannelLogin = callChannelLogin;
exports.checkSignPay = checkSignPay;
exports.callGamePay = callGamePay;
exports.checkOrder = checkOrder;
exports.CreateChannelOrder = CreateChannelOrder;
exports.compareOrder= compareOrder;
exports.checkChOrder = checkChOrder;