module.exports = function(services,alt_service_creds) {
  
  var watson = require('watson-developer-cloud');
  var Twitter = require('twitter');
  var _ = require('lodash');
  var async = require('async');
  
  var pi_utils = require('./lib/personality-util'); // flatten, similarity, matches
  var twitterEmoticons = require('./lib/twitter-emoticons'); // translates emoticons



  var creds = services, pi_creds, a_creds;
  if (creds.username && creds.password) {
    pi_creds = creds;
  } else if (creds.personality_insights) {
    pi_creds = creds.personality_insights[0].credentials;  
  } else {
    throw new Error("no personality_insights credentials found");
  }
  pi_creds.version = "v2";
  // console.log('using personality insights creds:', pi_creds);
  var personality_insights = watson.personality_insights(pi_creds);

  
  if (creds.alchemy_api) {
      a_creds = creds.alchemy_api[0].credentials;  
  } else if (alt_service_creds) {
      creds = alt_service_creds;
      if (creds.apikey) {
          a_creds = creds;
      } else if (creds.alchemy_api) {
          a_creds = creds.alchemy_api[0].credentials;  
      }
  }
  if (!a_creds) {
      throw new Error("no alchemy_api credentials found");
  }
  // console.log('using alchemy language creds:', a_creds);
  var alchemy_language = watson.alchemy_language(a_creds);


  
  
  
  if (!process.env.TWITTER_CONSUMER_KEY) throw new Error('no twitter keys found in .env');
  var client = new Twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  });



   
   // TEST just do a single user's timeline


  // console.log('got tweets called');

  var followStream = function(screen_name, next) {
      console.log('check replies to ', screen_name);
      client.stream('statuses/filter', {track: '@' + screen_name}, function(stream) {
        stream.on('data', function(tweet) {
          // console.log(tweet.text);
          next(tweet);
        });   
       
        stream.on('error', function(error) {
          throw error;
        }); 
      });
  }

  var addUserToAnalysisQueue = function(sourceTweet) {
      console.log('source tweet found:', sourceTweet.user.screen_name);
      analyzeUserTweets(sourceTweet.user.screen_name, function(err, ok){
        console.log('did we analyze anything:', err, ok);
      });
  }

  var getTweets = function(opts, cb) {
      client.get('statuses/user_timeline', opts, function(error, tweets, response){
            // console.log('client get user:', error, tweets, response);
          if (error) return cb(error);
          cb(null, tweets);
      });
  }
  var getUserTweets = function(screen_name, minWordCount, done) {
      var params = {
          screen_name: screen_name,
          include_rts: false,
          count: 200,
          // max_id: false, // set to the last ID we got from the list of tweets in first response
          // IF we didn't get enough words yet...
      };

      var text = '';

      // TODO manage rate limits
      // Requests / 15-min window 
      // (app auth) 
      // 300
      // easier to repeat here
      
      var handleTweets = function(err, tweets){
        // console.log(tweets);
        // console.log(screen_name, 'user fetch tweet count:', tweets.length);
        var last = false;
        if (tweets)
            last = _.last(tweets);
        // console.log('last tweet k:', last.id);
        
        if (err && text == '') return done(err);

        if (!last && !params.max_id) return done("no tweets to analyze");
        text += _.map(tweets, 'text').join(' ');
        var wc = text.split(' ').length;
//        console.log(screen_name, 'WORD COUNT:', wc);
        // if not enough words and we still have more tweets to fetch 
        // -- our WC is not so accurate so we pad
        if ((wc < minWordCount) && (params.max_id !== last.id)) {
//          console.log('not enough words but we have more tweets we can fetch');
          params.max_id = last.id;
          getTweets(params, handleTweets);
        } else {
            text = twitterEmoticons.massage(text);
//            console.log('*** got some text:', text);
            done(null,text,wc);
        } 
      }
      getTweets(params, handleTweets);
  }
  // 
  var analyzeUserTweets = function(screen_name, done) {
      getUserTweets( screen_name, 4000, function(err, text, wc){
          // will be called even if wc is lower if we run out of tweets. then we can rely on the PI errors for wc
          analyzeText(text, function(err, results){
//              console.log('got some results:', err, results);
              done(err, results);
          });
      });
  }
  var analyzeUserTweetsEmotion = function(screen_name, done) {
      getUserTweets( screen_name, 4000, function(err, text, wc){
          analyzeTextEmotion(text, function(err, results){
              done(err, results);
          });
      });
  }
  var analyzeUserTweetsPersonality = function(screen_name, done) {
      getUserTweets( screen_name, 4000, function(err, text, wc){
          analyzeTextPersonality(text, function(err, results){
              done(err, results);
          });
      });
  }
  var analyzeUserTweetsSentiment = function(screen_name, done) {
      getUserTweets( screen_name, 4000, function(err, text, wc){
          analyzeTextSentiment(text, function(err, results){
              done(err, results);
          });
      });
  }

  var analyzeText = function(text, done) {
      async.parallel({
          emotion: function(callback) {
              analyzeTextEmotion(text,callback);
          },
          personality: function(callback) {
              analyzeTextPersonality(text,callback);
          },
          sentiment: function(callback) {
              analyzeTextSentiment(text,callback);
          }
      }, function(err, results) {
          if (err)
              console.log('analyzeText ERROR:', err);
          else
              console.log('analyzeText results:', JSON.stringify(results, null, 2));
          done(err, results);
      });
  }
  var analyzeTextEmotion = function(text, done) {
      alchemy_language.emotion({text: text}, function (err, response) {
//        if (err)
//            console.log('alchemy_language.emotion ERROR:', err);
//        else
//            console.log('alchemy_language.emotion response:', JSON.stringify(response, null, 2));
          done(err, response);
      });
  }
  var analyzeTextPersonality = function(text, done) {
      personality_insights.profile({text: text}, function(err, response){
          if (err) {
//              console.log('personality_insights.profile ERROR:', err);
          } else {
//              console.log('personality_insights.profile response:', JSON.stringify(response, null, 2));
              response.flat = pi_utils.flatten(response.tree);
          }
          done(err, response);
      });
  }
  var analyzeTextSentiment = function(text, done) {
      alchemy_language.sentiment({text: text}, function (err, response) {
//        if (err)
//            console.log('alchemy_language.sentiment ERROR:', err);
//        else
//            console.log('alchemy_language.sentiment response:', JSON.stringify(response, null, 2));
          done(err, response);
      });
  }
  
  return {
      feed: followStream,
      addUser: addUserToAnalysisQueue,
      
      analyzeUser: analyzeUserTweetsPersonality, // old functionality
      analyzeUserAll: analyzeUserTweets,
      analyzeUserEmotion: analyzeUserTweetsEmotion,
      analyzeUserPersonality: analyzeUserTweetsPersonality,
      analyzeUserSentiment: analyzeUserTweetsSentiment,
      
      analyzeText: analyzeTextPersonality, // old functionality
      analyzeTextAll: analyzeText,
      analyzeTextEmotion: analyzeTextEmotion,
      analyzeTextPersonality: analyzeTextPersonality,
      analyzeTextSentiment: analyzeTextSentiment
  };  
}
