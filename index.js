// firebase deploy --only functions
// firebase deploy --only functions:[function]


const functions = require('firebase-functions');
const admin = require('firebase-admin');
const gcs = require('@google-cloud/storage');
admin.initializeApp();
const storage = new gcs();

var bucket = admin.storage().bucket();

exports.setOwner = functions.https.onRequest((req, res) => {
  var split = req.query.text.split("|")
  var uid = split[0]
  var pid = split[1]
  return admin.database().ref('/Users/owners/' + uid).set({pid: true}).then((snapshot) => {
    return res.send(uid + " is now an owner of " + pid);
  });
});

exports.isOwner = functions.https.onRequest((req, res) => {
  var uid = req.query.text;
  return admin.database().ref('/Users/owners/' + uid).once("value")
  .then((snapshot) => {
    if (snapshot.val() !== null) {
      return res.send("true " + uid + " is owner of " + snapshot.val().ownerOf);
    }
    else {
      return res.send("false " + uid + " is not an owner")
    }
  });
});

// If "deals/uid/pid" is made, check if "Users/owners/uid/pid" exists. If so, add deal to pidPath/deal/dealPath: path to deal, else, delete path
exports.SetDeal = functions.database.ref('Users/owners/{uid}/{pid}/tempDeal')
.onCreate((snapshot, event) => {
  console.log("v0.0.5");

  const uid = event.params.uid;
  const pid = event.params.pid;

  return admin.database().ref('Users/owners/' + uid + '/' + pid + '/owns').once('value').then((ss) => {
    if (ss.exists()) {
      const shortInfo = snapshot.child('shortInfo').val();
      const info = snapshot.child('info').val();
      const endTime = snapshot.child('endTime').val();
      const milli = snapshot.child('milli').val();
      const costs = snapshot.child('costs').val();
      const pName = snapshot.child('pName').val();
    
      var hours = Math.floor(milli / 3600000);
      var min = (milli % 3600000) / 60000;
      var sHours = ""
      var sMin = ""
      if (hours > 0) {
        sHours = hours + "h"
      }
      if (min > 0) {
        sMin = min + "m"
      }
      var length = sHours + " " + sMin
    
      admin.database().ref('subscribers/' + pid).once('value').then(function(messSS) {
        messSS.forEach(function(childSS) {
          var uidToken = String(childSS.val());
          if (!uidToken == null && uidToken != "") {
            var message = {
              notification: {
                title: (pName + ' - ' + length + " Deal"),
                body: (info)
              },
              apns: {
                headers: {
                  'apns-priority': '10'
                },
                payload: {
                  aps: {
                    sound: 'default'
                  }
                }
              },
              token: uidToken
            }
          
            admin.messaging().send(message)
            .then((response) => {
              // Response is a message ID string.
              console.log('Successfully sent message:', response);
            })
            .catch((error) => {
              console.log('Error sending message:', error);
            });
          }
        })
      })
      admin.database().ref('deals/' + pid).set({'shortInfo': shortInfo, 'info': info, 'endTime': endTime, 'milli': milli, 'costs': costs, 'pName': pName})
    }

    return admin.database().ref('Users/owners/' + uid + '/' + pid + '/tempDeal').set(null);
  });
});

exports.SetComment = functions.database.ref('Users/basics/{userId}/tempComment')
.onCreate((snapshot, event) => {
  console.log("v0.0.2");
  
  const action = snapshot.child('action').val();
  const uid = event.params.userId;

  if (action == 'New') {
    const busyness = parseInt(snapshot.child('busyness').val());
    const comment = snapshot.child('comment').val();
    const pid = snapshot.child('pid').val();
    const timestamp = parseInt(snapshot.child('timestamp').val());
    const waitTime = parseInt(snapshot.child('waitTime').val());
    const photoKey = snapshot.child('photoKey').val();
    const username = snapshot.child('username').val();
    const commentKey = admin.database().ref('comments').push();

    admin.database().ref(commentKey).set({'busyness': busyness, 'comment': comment, 'pid': pid, 'uid': uid, 'timestamp': timestamp, 
      'username': username, 'waitTime': waitTime, 'photoKey': photoKey});
    
    admin.database().ref('commentTimestamps/' + pid + '/' + commentKey.key).set(-timestamp);

    admin.database().ref('Users/basics/' + uid + '/tempComment').set(null);

    admin.database().ref('Users/basics/' + uid + '/points').once('value').then(userSS => {
      var commentPoints = 10;
      var sPoints = userSS.val();
      var iPoints = parseInt(sPoints);
      iPoints += commentPoints;
    
      admin.database().ref('Users/basics/' + uid + '/points').set(iPoints);
    });
  } else if (action == 'Edit') {
  } else if (action == 'Delete') {
    const key = snapshot.child('key').val();
    admin.database().ref('comments/' + key).once('value').then(commentSS => {
      if (commentSS.child('uid').val() == uid) {
        admin.database().ref('comments/' + key).set(null);
        admin.database().ref('commentTimestamps/' + commentSS.child('pid').val() + '/' + key).set(null);
      }
    })
  }

  return admin.database().ref('Users/basics/' + uid + '/tempComment').set(null);
})

exports.SetBanner = functions.database.ref('Users/owners/{uid}/{pid}/tempBanner')
.onCreate((snapshot, event) => {
  console.log("v0.0.3");
  
  var uid = event.params.uid;
  var pid = event.params.pid;

  var ref = admin.database().ref('Users/owners/' + uid + '/' + pid);
  return admin.database().ref(ref).once('value').then(ss => {
    var key = ss.child("tempBanner").val()
    if (ss.child('owns').exists) {
      if (key != false) {
        admin.database().ref('banners/' + pid + '/uid').set(uid);
        admin.database().ref('banners/' + pid + '/key').set(key);
        return admin.database().ref('Users/owners/' + uid + '/' + pid + '/tempBanner').set(null);
      } else {
        admin.database().ref('banners/' + pid).set(null);
        return admin.database().ref('Users/owners/' + uid + '/' + pid + '/tempBanner').set(null);
      }
    } else {
      return admin.database().ref('Users/owners/' + uid + '/' + pid + '/tempBanner').set(null);
    }
  })
})



/*exports.deleteOld = functions.database.ref('timedPaths/{path}')
.onCreate((snapshot, event) => {
  console.log("v0.0.5");
  
  // Removes commentPaths older than timer
  ref = admin.database().ref('timedPaths');
  var cutoff = Date.now() - 3600000; // 1000 = 1 second
  var oldItemsQuery = ref.orderByChild('timestamp').endAt(cutoff);
  return oldItemsQuery.once('value', function(snapshot) {
    // create a map with all children that need to be removed
    var updates = {};
    snapshot.forEach(function(child) {
      updates[child.key] = null
    });
    // execute all updates in one go and return the result to end the function
    return ref.update(updates);
  });
});

exports.deletePaths = functions.database.ref('timedPaths/{path}')
.onDelete((snapshot, event) => {
  // ADD CONFIRMATION THAT pidKey is right ********************
  console.log("v0.0.4");
  var ref = snapshot.child('pid').val();
  admin.database().ref(ref).set(null);

  ref = snapshot.child('uidKey').val();
  admin.database().ref(ref).set(null);

  var fileName = snapshot.child('photoPath').val();
  if (fileName != null) {
    var bucketName = 'crierabc-bf743.appspot.com'
    return storage.bucket(bucketName).file(fileName).delete().then(() => {
      return console.log(`gs://${bucketName}/${fileName} deleted.`);
    })
    .catch(err => {
      return console.error('ERROR:' , err);
    })
  } else {
    return console.log("No image");
  }


  // MAKE IT SO THE UPVOTES ARE ADDED TO POINTS AFTERWARDS *************
})*/
