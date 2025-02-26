/**
 * Copyright 2018 Google LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

 import * as firebase from 'firebase-admin'
 import * as functions from 'firebase-functions';
 import { ProductType, PurchaseUpdateError, DeveloperNotification, NotificationType } from "../../play-billing";
 import { playBilling, PACKAGE_NAME, instanceIdManager, sendHttpsError, verifyFirebaseAuthIdToken, logAndThrowHttpsError } from '../shared'
 import { SubscriptionStatus } from '../../model/SubscriptionStatus';

 /* This file contains implementation of functions related to linking subscription purchase with user account
  */

 /* HTTPS request that registers a subscription purchased
  * in Android app via Google Play Billing to an user.
  *
  * It only works with brand-new subscription purchases,
  * which have not been registered to other users before.
  *
  * @param {Request} request
  * @param {Response} response
  */
 export const subscription_register = functions.https.onRequest(async (request, response) => {
  return Promise.resolve().then(async () => {
  //  return verifyFirebaseAuthIdToken(request, response)
  //    .then(async (decodedToken) => {
       const product = request.body.product;
      //  const uid = decodedToken.uid;
       const token = request.body.purchaseToken;

       if (!token || !product) {
      //  if (!token || !uid || !product) {
         throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters!');
       }

      //  try {
      //    await playBilling.purchases().registerToUserAccount(
      //      PACKAGE_NAME,
      //      product,
      //      token,
      //      ProductType.SUBS,
      //      uid
      //    );
      //  } catch (err) {
      //    switch (err.name) {
      //      case PurchaseUpdateError.CONFLICT: {
      //        logAndThrowHttpsError('already-exists', err.message);
      //      }
      //      case PurchaseUpdateError.INVALID_TOKEN: {
      //        logAndThrowHttpsError('not-found', err.message);
      //      }
      //      default: {
      //        logAndThrowHttpsError('internal', err.message);
      //      }
      //    }
      //  };

       const data = await getSubscriptionsResponseObjectByToken(PACKAGE_NAME, product, token);
      //  const data = await getSubscriptionsResponseObject(uid);
       response.send(data);
     }).catch((error: functions.https.HttpsError) => {
       sendHttpsError(error, response);
     });
 });

 /**
  * HTTPS request that acknowledges a subscription purchased in Android app via
  * Google Play Billing to an user.
  *
  * @param {Request} request
  * @param {Response} response
  */
 export const acknowledge_purchase = functions.https.onRequest(async (request, response) => {
   console.log('acknowledge_purchase called server side');
   return Promise.resolve().then(async () => {
  //  return verifyFirebaseAuthIdToken(request, response)
  //  .then(async (decodedToken) => {
     const product = request.body.product;
    //  const uid = decodedToken.uid;
     const token = request.body.purchaseToken;

     if (!token || !product) {
    //  if (!token || !uid) {
       throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters!');
     }
     try {
       await playBilling.purchases().acknowledgePurchase(
         PACKAGE_NAME,
         product,
         token
       );
     } catch (err) {
       console.log('There was an error', err.message);
     }

     const data = await getSubscriptionsResponseObjectByToken(PACKAGE_NAME, product, token);
    //  const data = await getSubscriptionsResponseObject(uid);
     console.log('data back from Firestore: ', data);
     response.send(data);
   })
 })

 /* HTTPS request that registers a subscription purchased
  * in Android app via Google Play Billing to an user.
  *
  * It only works with all active subscription purchases,
  * no matter if it's registered or not.
  *
  * @param {Request} request
  * @param {Response} response
  */
 export const subscription_transfer = functions.https.onRequest(async (request, response) => {
   return verifyFirebaseAuthIdToken(request, response)
     .then(async (decodedToken) => {
       const product = request.body.product;
       const uid = decodedToken.uid;
       const token = request.body.purchaseToken;

       try {
         await playBilling.purchases().transferToUserAccount(
           PACKAGE_NAME,
           product,
           token,
           ProductType.SUBS,
           uid
         );
       } catch (err) {
         switch (err.name) {
           case PurchaseUpdateError.INVALID_TOKEN: {
             logAndThrowHttpsError('not-found', err.message);
           }
           default: {
             logAndThrowHttpsError('internal', err.message);
           }
         }
       }

       const data = await getSubscriptionsResponseObject(uid);
       response.send(data);
     }).catch((error: functions.https.HttpsError) => {
       sendHttpsError(error, response);
     });
 });

 /* HTTPS request that returns a list of active subscriptions
  * and those under Account Hold.
  *
  * Subscriptions in Account Hold can still be recovered,
  * so it's useful that client app know about them and show
  * an appropriate message to the user.
  *
  * @param {Request} request
  * @param {Response} response
  */
 export const subscription_status = functions.https.onRequest(async (request, response) => {
   return verifyFirebaseAuthIdToken(request, response)
     .then(async decodedToken => {
       const uid = decodedToken.uid;
       const responseData = await getSubscriptionsResponseObject(uid)
       response.send(responseData);
     }).catch((error: functions.https.HttpsError) => {
       sendHttpsError(error, response);
     });
 });

 /* PubSub listener which handle Realtime Developer Notifications received from Google Play.
  * See https://developer.android.com/google/play/billing/realtime_developer_notifications.html
  * 此处 pubsub.topic 需要与 客户端开发、产品配置人员 确认topic，有可能每个产品不一样
  */
 export const realtime_notification_listener = functions.pubsub.topic('subscription').onPublish(async (data, context) => {
   try {
     // Process the Realtime Developer notification
     const developerNotification = <DeveloperNotification>data.json;
     console.log('Received realtime notification: ', developerNotification);
     const purchase = await playBilling.purchases().processDeveloperNotification(PACKAGE_NAME, developerNotification);

     // Send the updated SubscriptionStatus to the client app instances of the user who own the purchase
    //  if (purchase && purchase.userId) {
    //    await sendSubscriptionStatusUpdateToClient(purchase.userId,
    //      developerNotification.subscriptionNotification.notificationType)
    //  }
   } catch (error) {
     console.error(error);
   }
 })

 // Util method to get a list of subscriptions belong to an user, in the format that can be returned to client app
 // It also handles library internal error and convert it to an HTTP error to return to client.
 async function getSubscriptionsResponseObject(userId: string): Promise<Object> {
   try {
     // Fetch purchase list from purchase records
     const purchaseList = await playBilling.users().queryCurrentSubscriptions(userId);
     // Convert Purchase objects to SubscriptionStatus objects
     const subscriptionStatusList = purchaseList.map(subscriptionPurchase => new SubscriptionStatus(subscriptionPurchase));
     // Return them in a format that is expected by client app
     return { subscriptions: subscriptionStatusList }
   } catch (err) {
     console.error(err.message);
     throw new functions.https.HttpsError('internal', 'Internal server error');
   }
 }

 async function getSubscriptionsResponseObjectByToken(packageName: string, product: string, token: string): Promise<Object> {
  try {
    // Fetch purchase list from purchase records
    const purchaseList = [];
    purchaseList.push(await playBilling.purchases().querySubscriptionPurchase(packageName, product, token));
    // Convert Purchase objects to SubscriptionStatus objects
    const subscriptionStatusList = purchaseList.map(subscriptionPurchase => new SubscriptionStatus(subscriptionPurchase));
    // Return them in a format that is expected by client app
    return { subscriptions: subscriptionStatusList }
  } catch (err) {
    console.error(err.message);
    throw new functions.https.HttpsError('internal', 'Internal server error');
  }
}

 // Util method to send updated list of SubscriptionPurchase to client app via FCM
 async function sendSubscriptionStatusUpdateToClient(userId: string, notificationType: NotificationType): Promise<void> {
   // Fetch updated subscription list of the user
   const subscriptionResponseObject = await getSubscriptionsResponseObject(userId);

   // Get token list of devices that the user owns
   const tokens = await instanceIdManager.getInstanceIds(userId);

   // Compose the FCM data message to send to the devices
   const message = {
     data: {
       currentStatus: JSON.stringify(subscriptionResponseObject),
       notificationType: notificationType.toString()
     }
   }

   // Send message to devices using FCM
   const messageResponse = await firebase.messaging().sendToDevice(tokens, message);
   console.log('Sent subscription update to user devices. UserId =', userId,
     ' messageResponse = ', messageResponse);

   const tokensToRemove = [];
   messageResponse.results.forEach((result, index) => {
     const error = result.error;
     if (error) {
       // There's some issue sending message to some tokens
       console.error('Failure sending notification to', tokens[index], error);
       // Cleanup the tokens who are not registered anymore.
       if (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered') {
         tokensToRemove.push(instanceIdManager.unregisterInstanceId(userId, tokens[index]));
       }
     }
   })
   await Promise.all(tokensToRemove);
 }
