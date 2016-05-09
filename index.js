module.exports = function(services) {
  
  var watson = require('watson-developer-cloud');
  var Twitter = require('twitter');
  var _ = require('lodash');

  var pi_utils = require('./lib/personality-util'); // flatten, similarity, matches



  var creds = services;
  if (!creds.personality_insights) throw new Error("no personality insights credentials found");
  var pi_creds = creds.personality_insights[0];
  pi_creds.credentials.version = "v2";
  // console.log('using pi creds:', pi_creds.credentials);
  var personality_insights = watson.personality_insights(pi_creds.credentials);

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

  // 
  var analyzeUserTweets = function(screen_name, done) {
      var params = {
          screen_name: screen_name,
          include_rts: false,
          count: 200,
          // max_id: false, // set to the last ID we got from the list of tweets in first response
          // IF we didn't get enough words yet...
      };

      var text = "";

      // TODO manage rate limits
      // Requests / 15-min window 
      // (app auth) 
      // 300
      // easier to repeat here
      
      var handleTweets = function(err, tweets){
        // console.log(tweets);
        console.log(screen_name, 'user fetch tweet count:', tweets.length);
        var last = _.last(tweets);
        // console.log('last tweet k:', last.id);
        if (!last && !params.max_id) return done("no tweets to analyze");
        text += _.map(tweets, 'text').join(' ');
        var wc = text.split(' ').length;
        console.log(screen_name, 'WORD COUNT:', wc);
        // if not enough words and we still have more tweets to fetch 
        // -- our WC is not so accurate so we pad
        if ((wc < 4000) && (params.max_id !== last.id)) {
          console.log('not enough words but we have more tweets we can fetch');
          params.max_id = last.id;
          getTweets(params, handleTweets);
        } else {
          // will be called even if wc is lower if we run out of tweets. then we can rely on the PI errors for wc
          analyzeText(text, function(err, results){
            console.log('got some results:', err, results);
            if (!err) results.flat = pi_utils.flatten(results.tree);
            done(err, results);
          })
        } 

        
      }

      getTweets(params, handleTweets);
  }

  var analyzeText = function(text, done) {
    personality_insights.profile({text: text}, done);
  }

  return {
      feed: followStream,
      addUser: addUserToAnalysisQueue,
      analyzeUser: analyzeUserTweets,
      analyzeText: analyzeText
  };  
}
