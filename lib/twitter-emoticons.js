
'use strict';

// http://emojipedia.org/
// http://www.i2symbol.com/twitter-emoticons
var emoticonsChar = require("./twitter-emoticons-char.json");

// http://cool-smileys.com/text-emoticons
var emoticonsText = require("./twitter-emoticons-text.json");

var emoticonRegExp = new RegExp('([.*+?^=!:${}()|\\[\\]\\/\\\\])', 'g');

var tweetRegExpList = [];
for (var emoticon in emoticonsChar) {
    tweetRegExpList.push( [ new RegExp(emoticon, 'g'), emoticonsChar[emoticon] ] );
}
for (var emoticon in emoticonsText) {
    var emoticonEsc = emoticon.replace(emoticonRegExp, '\\$1');
    tweetRegExpList.push( [ new RegExp('\\s'+emoticonEsc+'\\s', 'g'), emoticonsText[emoticon] ] );
    tweetRegExpList.push( [ new RegExp('\\s'+emoticonEsc+'$', 'g'), emoticonsText[emoticon] ] );
    tweetRegExpList.push( [ new RegExp('^'+emoticonEsc+'$', 'g'), emoticonsText[emoticon] ] );
}
tweetRegExpList.push( [ new RegExp('#', 'g'), '' ] );

/**
 * Returns a 'cleaned' version of the twitter feed emoticons
 * @return string
 */
var massageTweet = function(tweetText) {
    var i, tweetRegExp, l = tweetRegExpList.length;
    for (i = 0; i < l; i++) {
        tweetRegExp = tweetRegExpList[i];
        tweetText = tweetText.replace( tweetRegExp[0], tweetRegExp[1] );
    }
    return tweetText;
};

module.exports = {
    massage: massageTweet
};