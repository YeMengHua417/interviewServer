var express = require('express');
var router = express.Router();
var captcha = require('svg-captcha'); // 验证码
const NodeRSA = require('node-rsa');
var path = require('path');
var fs = require('fs');
const nodemailer = require('nodemailer');

var answer = []; // 问题答案
const numOfQuestion = 5;


const key = new NodeRSA({b: 512});
key.setOptions({encryptionScheme: 'pkcs1'});


/**
 *  获取公钥
 **/
router.get('/key',  (req, res, next) => {
  let publicKey = key.exportKey('public'); //生成公钥

  res.send({
    code: 200,
    data:{
      publicKey:publicKey
    },
    msg: ''
  });
});

/**
 *  获取验证码
 **/
router.get('/getIdentifyCode', function (req, res, next) {
  // var codeConfig = {
  //   size: 5,// 验证码长度
  //   ignoreChars: '0o1i', // 验证码字符中排除 0o1i
  //   noise: 2, // 干扰线条的数量
  //   height: 44
  // };
  const cap = captcha.createMathExpr();
  req.session.captcha = cap.text;
  res.type('svg');
  res.status(200).send(cap.data);
});

/**
 *  登录后返token，其实这个只是前端做路由校验，随便什么值，自己定义都可以
 **/
function redomToken(len) {
  var len = len || 32;
  var chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';    /****默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1****/
  var maxpos = chars.length;
  var str = '';

  for (var i=0; i < len; i++) {
    str += chars.charAt(Math.floor(Math.random() * maxpos))
  }
  return str;
}
/**
 *   登录
 **/
router.post('/login', function (req, res) {

    console.log("req.body",req.body)
    // token 过期－－这里肯定有个公共处理的地方
    // 验证码
    if(req.session.captcha != req.body.vertifyCode){
        res.send({
          code: 101,
          data:{},
          msg: 'The verification code you input is incorrect, please input the verification code again.'
        });
        return;
    }

    let name = key.decrypt(req.body.name.replace(/\s+/g, '+'), 'utf8');
    let telephone = key.decrypt(req.body.telephone.replace(/\s+/g, '+'), 'utf8');

    // 用户重复登录
    if( name === 'kevin' ){
      res.send({
        code: 102,
        data:{},
        msg: 'your answer has been successfully submitted'
      });
      return;
    }

    req.session.user={
      name:name,
      telephone:telephone //telphone做主key
    };

    // 存数据库
    req.session.token = '_' + redomToken();

    res.send({
        code: 200,
        data:{
          token: req.session.token
        },
        msg: ''
    });

});

/**
 *  退出
 **/
router.post('/logout', function (req, res) {
    console.log("logout:",req.session.token)
    req.session.token = null;
    res.send({
      code: 200,
      msg: ''
    });
});

function getRandomArrayElement(arr,count){
  var shuffled = arr.slice(0), i = arr.length, min = i - count, temp, index;
  while (i-- > min) {
    index = Math.floor((i + 1) * Math.random());
    temp = shuffled[index];
    shuffled[index] = shuffled[i];
    shuffled[i] = temp;
  }
  return shuffled.slice(min);
}
/**
 *  获取试题
 **/
router.get('/questions',function (req, res) {
  var file = path.join(__dirname, '../static/questionBank.json');
  fs.readFile(file, 'utf-8', function(err, data) {
    if (err) {
      res.send({
        code: 103,
        data:{},
        msg: 'Can not get questionBank!'
      });
    } else {
      //随机选取5道题目
      var data = (JSON.parse(data.trim()));
      data.question = getRandomArrayElement(data.question,numOfQuestion);

      answer=[];
      // 把5道题的答案纪录，发送的时候给排除了
      for(let index = 0;index<data.question.length;index++){
        answer.push(data.question[index].rightAnswer);
        delete data.question[index].rightAnswer;
      }

      res.send({
        code: 200,
        data:{
          exam:data
        },
        msg: ''
      });
    }
  });

  function GetPercent(num, total) {
    /// <summary>
    /// 求百分比
    /// </summary>
    /// <param name="num">当前数</param>
    /// <param name="total">总数</param>
    num = parseFloat(num);
    total = parseFloat(total);
    if (isNaN(num) || isNaN(total)) {
      return "-";
    }
    return total <= 0 ? "0%" : (Math.round(num / total * 10000) / 100.00)+"%";
  }

  /**
   *  发送答案
   **/

  function sendEmail(req,score){
    let transporter = nodemailer.createTransport({
      // host: 'smtp.ethereal.email',
      service: '163', // 使用了内置传输发送邮件 查看支持列表：https://nodemailer.com/smtp/well-known/
      port: 465, // SMTP 端口
      secureConnection: true, // 使用了 SSL
      auth: {
        user: 'april1984417@163.com',
        // 这里密码不是qq密码，是你设置的smtp授权码
        pass: 'Ros818930',
      }
    });

    let mailOptions = {
      from: '"yezi" <april1984417@163.com>', // sender address
      to: 'april1984417@163.com', // list of receivers
      subject: 'test', // Subject line
      // 发送text或者html格式
      // text: 'Hello world?', // plain text body
      html: '<div>name:'+req.session.user.name+'</div><div>score:'+score+'</div>' // html body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(error);
      }
      console.log('Message sent: %s', info.messageId);
    });
  }


  router.post('/result',function (req,res) {
      let userAnswer = req.body;
      let rightAnswerNum = 0;

      for(let index = 0;index < numOfQuestion -1;index++){
        if(answer[index] === userAnswer[index]){
          rightAnswerNum++;
        }
      }

      let score = GetPercent(rightAnswerNum,numOfQuestion);
      console.log("score",score);


      sendEmail(req,score);

      //  对比给出分数，发送邮件
      res.send({
        code: 200,
        data:{},
        msg: ''
      });
  })

})

module.exports = router;
