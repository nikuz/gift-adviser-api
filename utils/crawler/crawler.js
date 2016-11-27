'use strict';

var db = require('../../app/db'),
  async = require('async'),
  _ = require('underscore'),
  validator = require('../../app/modules/validator'),
  EventEmitter = require('events').EventEmitter,
  jsdom = require('jsdom'),
  urls = require('./urls.json');

exports = module.exports = function(options = {}, cb = _.noop) {
  var workflow = new EventEmitter();

  workflow.on('filter', function() {
    async.series([
      function(callback) {
        db.createTable({
          name: 'goods',
          fields: {
            id: 'MEDIUMINT NOT NULL AUTO_INCREMENT',
            url: 'TEXT',
            name: 'CHAR(255) NOT NULL',
            price: 'CHAR(30) NOT NULL',
            rating: 'FLOAT NOT NULL',
            provider: 'CHAR(30) NOT NULL',
            created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP',
            'PRIMARY KEY': '(id)'
          }
        }, callback);
      },
      function(callback) {
        db.select({
          from: 'goods',
          fields: ['url'],
          where: `url IN (${_.map(urls, (item) => { return `'${item.url}'`; })})`
        }, function(err, response) {
          if (err) {
            callback(err);
          } else {
            if (response.length) {
              _.each(response, function(responseItem) {
                urls = _.reject(urls, function(item) {
                  return item.url === responseItem.url;
                });
              });
            }
            callback();
          }
        });
      }
    ], function(err) {
      if (err) {
        cb(err);
      } else {
        workflow.emit('crawl');
      }
    });
  });

  workflow.on('crawl', function() {
    var jQuery = ['http://code.jquery.com/jquery.js'];

    console.log('Urls:', urls.length);

    async.eachSeries(urls, function(item, callback) {
      async.waterfall([
        function(internalCallback) {
          jsdom.env(item.url, jQuery, function(err, window) {
            if (err) {
              return internalCallback(err);
            }

            let price = window.$('#priceblock_ourprice').text()
              || window.$('#priceblock_dealprice').text();

            internalCallback(null, {
              name: window.$('#productTitle').text(),
              price: price,
              rating: parseFloat(window.$('#reviewStarsLinkedCustomerReviews .a-icon-alt').text())
            });
          });
        },
        function(data, internalCallback) {
          db.insert({
            to: 'goods',
            fields: {
              url: item.url,
              name: data.name,
              price: data.price,
              rating: data.rating,
              provider: item.provider
            }
          }, internalCallback);
        }
      ], callback);
    }, cb);
  });

  workflow.emit('filter');
};
