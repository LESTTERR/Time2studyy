const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.sendScheduledNotifications = functions.pubsub
    .schedule("every 1 minutes")
    .onRun(async (context) => {
      const now = Date.now();
      const lookBackWindow = now - 60 * 1000; // 1 minute grace period

      const snapshot = await db.collection("scheduledNotifications")
          .where("sent", "==", false)
          .where("scheduledAt", ">=", lookBackWindow)
          .where("scheduledAt", "<=", now)
          .get();

      if (snapshot.empty) {
        console.log("No notifications to send.");
        return null;
      }

      const promises = [];

      snapshot.forEach((doc) => {
        const data = doc.data();

        const message = {
          token: data.token,
          notification: {
            title: data.title,
            body: data.body,
          },
          data: {
            notificationId: doc.id,
          },
        };

        // send FCM
        const p = admin.messaging().send(message)
            .then(() => {
              console.log("Sent to:", data.token);

              // mark as sent and delete to save storage
              return doc.ref.delete();
            })
            .catch((err) => {
              console.error("FCM error:", err);
              // Could implement retry logic here
            });

        promises.push(p);
      });

      await Promise.all(promises);

      console.log("Batch completed.");
      return null;
    });