/* eslint-disable consistent-return */
/* eslint-disable max-len */

// Mac: 00D02DA7A93B
// CRC: 76A8

'use strict';

const Homey = require('homey');
const axios = require('axios');
const https = require('https');
const eventBus = require('@tuxjs/eventbus');

axios.defaults.timeout = 30000;
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });

class Evohome extends Homey.App {

  async onInit() {
    this.log('EvoHomeApp has been initialized');
    this.debug = false;
    this.loginGrant = false;
    this.locationsIdArray = []; // create a empty array for locationId's ( needed for statuspolling )

    // starts the token renewal service on timer
    await this.tokenRenewalService();
    await this.zoneStatusSytemModeRenewalService();

    if (this.homey.settings.get('username') !== null || this.homey.settings.get('password') !== null) {
      await this.loginServices(this.homey.settings.get('username'), this.homey.settings.get('password')).catch(this.error);
    }

    /// //////////////////////////////////////////////////
    ///   FLOW ACTIONS                                 ///
    /// //////////////////////////////////////////////////

    const actionSetTemperatureResetDevice = this.homey.flow.getActionCard('reset_temperature');
    actionSetTemperatureResetDevice.registerRunListener(async (args) => {
      await this.setTargetTemperature(args.device.getData().id, null, 'FollowSchedule', null);
      this.log(`Set with flow (toEvoHome) temperature-reset for ZONE: ${args.device.getName()} ---ID: ${args.device.getData().id}`);
    });

    const actionSetTemperaturePermanent = this.homey.flow.getActionCard('set_temperature_permanent');
    actionSetTemperaturePermanent.registerRunListener(async (args) => {
      await this.setTargetTemperature(args.device.getData().id, args.temperature, 'PermanentOverride', null);
      this.log(`Set with flow (toEvoHome) temperature-permanentoverride: ${args.temperature} for ZONE: ${args.device.getName()} ---ID: ${args.device.getData().id}`);
    });

    const actionSetTemperaturetemporary = this.homey.flow.getActionCard('set_temperature_temporary');
    actionSetTemperaturetemporary.registerRunListener(async (args) => {
      const tmpTime = new Date();
      tmpTime.setHours(tmpTime.getHours() + args.hour);
      tmpTime.setSeconds(0, 0);
      await this.setTargetTemperature(args.device.getData().id, args.temperature, 'TemporaryOverride', tmpTime.toISOString().replace(/\.\d+Z/, 'Z'));
      this.log(`Set with flow (toEvoHome) temperature-temporaryoverride: ${args.temperature} --hours:${tmpTime.toISOString().replace(/\.\d+Z/, 'Z')} for ZONE: ${args.device.getName()} ---ID: ${args.device.getData().id}`);
    });

    const actionSetQuikAction = this.homey.flow.getActionCard('set_quickaction');
    actionSetQuikAction.registerRunListener(async (args) => {
      await this.setQuikAction(args.device.getData().id, args.quickaction, true, null);
      this.log(`Set with flow(toEvoHome) quickaction to ${args.quickaction} for system: ${args.device.getName()} ---ID: ${args.device.getData().id}}`);
    });
  }

  async delay(ms) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }

  // creates a array with all locationsId for zoneStatusSytemModeRenewalService
  async createLocationsArray(locationIdOld, locationIdNew) {
    if (locationIdOld === locationIdNew) {
      this.locationsIdArray.push(locationIdOld);
    } else {
      this.locationsIdArray.push(locationIdNew);
    }
    this.locationsIdArray = [...new Set(this.locationsIdArray)]; // remove duplicates
    if (this.debug) {
      this.log(`LocationID Array: ${this.locationsIdArray}`);
    }
  }

  // zone status update and system mode status update
  async zoneStatusSytemModeRenewalService() {
    this.homey.setInterval(async () => {
      if (this.locationsIdArray.length !== 0 && this.loginGrant) {
        for (let i = 0; i < this.locationsIdArray.length; i++) {
          if (this.debug) {
            this.log(`Polling location: ${this.locationsIdArray[i]}`);
          }
          await this.getZonesStatusSystemModeStatus(this.locationsIdArray[i]);
        }
      }
    }, 30000); // 30 sec update interval
  }

  // when a login fails bij invalid_grand  or rate-limiting try login again
  async loginFailedRetry() {
    await this.delay(20000); // 20 sec
    if (this.homey.settings.get('username') !== null || this.homey.settings.get('password') !== null) {
      if (!this.loginGrant) {
        this.log('Retrying login');
        await this.loginServices(this.homey.settings.get('username'), this.homey.settings.get('password')).catch(this.error);
      }
    }
  }

  // Check if acceess token is expired, if so a new token will be granted by the refreshTokenServices function
  async tokenRenewalService() {
    this.homey.setInterval(async () => {
      if (this.loginGrant) {
        const currentTime = new Date();
        const expireTime = Date.parse(this.access_token_expires);
        const difference = expireTime - currentTime;
        if (difference < 10 * 1000) {
          await this.refreshTokenServices();
        }
      }
    }, 1000);
  }

  // check for device if there was a succesful login
  async checkSuccesfulLogin() {
    return this.loginGrant;
  }

  /// ///////////////////////////////////////////////////
  ///    Evohome API                                  ///
  /// ///////////////////////////////////////////////////

  // loginServices with username and password, succesful login generate the access_token and refresh_token
  async loginServices(username, password) {
    try {
      const { data, status } = await axios({
        method: 'put',
        url: 'https://tccna.honeywell.com/Auth/OAuth/Token',
        headers: {
          Authorization: 'Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==',
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          'Cache-Control': 'no-store no-cache',
          Connection: 'Keep-Alive',
          Pragma: 'no-cache',
        },
        data: {
          grant_type: 'password',
          scope: 'EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account',
          Username: username,
          Password: password,
        },
      });
      if (typeof status !== 'undefined') {
        if (status === 200) {
          this.homey.settings.set('username', username);
          this.homey.settings.set('password', password);
          this.access_token = data.access_token;
          this.refresh_token = data.refresh_token;
          const currentTime = new Date();
          this.access_token_expires = new Date(currentTime.getTime() + data.expires_in * 1000);
          this.log(`Succesful login for user: ${username}`);
          this.log(`AccesToken:  ${this.access_token}\n`);
          this.log(`RefreshToken: ${this.refresh_token}\n`);
          this.loginGrant = true;
          clearTimeout(this.failedLoginTimeout); // clear the timeout
          return true;
        }
      }
    } catch (err) {
      if (err.response.status !== 200) {
        this.log(`loginServices Resource could not be found: ${err.response.status}`);
        this.loginGrant = false;
        this.loginFailedRetry();
      }
    }
  }

  // refreshTokenServices generates a new access_token and refresh_token
  async refreshTokenServices() {
    try {
      const { data, status } = await axios({
        method: 'put',
        url: 'https://tccna.honeywell.com/Auth/OAuth/Token',
        headers: {
          Authorization: 'Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==',
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          'Cache-Control': 'no-store no-cache',
          Connection: 'Keep-Alive',
          Pragma: 'no-cache',
        },
        data: {
          grant_type: 'refresh_token',
          refresh_token: this.refresh_token,
        },
      });
      if (typeof status !== 'undefined') {
        if (status === 200) {
          this.access_token = data.access_token;
          this.refresh_token = data.refresh_token;
          const currentTime = new Date();
          this.access_token_expires = new Date(currentTime.getTime() + data.expires_in * 1000);
          this.log('Token expired, refreshing');
          this.log(`AccesToken  :  ${this.access_token}\n`);
          this.log(`Refreshtoken: ${this.refresh_token}\n`);
        }
      }
    } catch (err) {
      if (err.response.status !== 200) {
        this.log(`refreshTokenServices Resource could not be found: ${err.response.status}`);

        // if refreshToken failed due HTTP error try to login again.
        if (this.homey.settings.get('username') !== null || this.homey.settings.get('password') !== null) {
          await this.loginServices(this.homey.settings.get('username'), this.homey.settings.get('password')).catch(this.error);
        }
      }
    }
  }

  // get the ID  from the useraccount
  async getUserAccount() {
    try {
      const { data, status } = await axios({
        method: 'get',
        url: 'https://tccna.honeywell.com//WebAPI/emea/api/v1/userAccount',
        headers: {
          Authorization: `bearer ${this.access_token}`,
          'Content-type': 'application/json',
        },
      });
      if (typeof status !== 'undefined') {
        if (status === 200) {
          return (data);
        }
      }
    } catch (err) {
      if (err.response.status !== 200) {
        this.log(`getUserAccount Resource could not be found: ${err.response.status}`);
      }
    }
  }

  // get the locationsID's  from userID
  async getLocationsZones(userID) {
    try {
      const { data, status } = await axios({
        method: 'get',
        url: `https://tccna.honeywell.com/WebAPI/emea/api/v1/location/installationInfo?userId=${userID}&includeTemperatureControlSystems=True`,
        headers: {
          Authorization: `bearer ${this.access_token}`,
          'Content-type': 'application/json',
        },
      });
      if (typeof status !== 'undefined') {
        if (status === 200) {
          return (data);
        }
      }
    } catch (err) {
      if (err.response.status !== 200) {
        this.log(`getLocationsZones Resource could not be found: ${err.response.status}`);
      }
    }
  }

  // get all zones and quikaction per locationID.
  async getZonesStatusSystemModeStatus(locationId) {
    try {
      const { data, status, request } = await axios({
        method: 'get',
        url: `https://tccna.honeywell.com/WebAPI/emea/api/v1/location/${locationId}/status?includeTemperatureControlSystems=True`,
        headers: {
          Authorization: `bearer ${this.access_token}`,
          'Content-type': 'application/json',
        },
      });
      if (typeof status !== 'undefined') {
        if (status === 200) {
          const array = [data, request];
          eventBus.publish('zoneStatusQuikActionStatus', array); // send it over the eventbus to every device instance.
        }
      }
    } catch (err) {
      if (err.response.status !== 200) {
        this.log(`getZonesStatusSystemModeStatus Resource could not be found: ${err.response.status}`);
      }
    }
  }

  // Set the target temperature from a zone by zoneID
  async setTargetTemperature(zoneId, value, mode, time) {
    try {
      await axios({
        method: 'put',
        url: `https://tccna.honeywell.com/WebAPI/emea/api/v1/temperatureZone/${zoneId}/heatSetpoint`,
        headers: {
          Authorization: `bearer ${this.access_token}`,
          'Content-type': 'application/json',
        },
        data: {
          HeatSetpointValue: value,
          SetpointMode: mode, // PermanentOverride, TemporaryOverride, FollowSchedule
          TimeUntil: time, // null
        },
      });
    } catch (err) {
      if (err.response.status !== 200) {
        this.log(`setTargetTemperature Resource could not be found: ${err.response.status}`);
      }
    }
  }

  // Set the quikaction from a system by systemID
  async setQuikAction(systemId, value, mode, time) {
    try {
      await axios({
        method: 'put',
        url: `https://tccna.honeywell.com/WebAPI/emea/api/v1/temperatureControlSystem/${systemId}/mode`,
        headers: {
          Authorization: `bearer ${this.access_token}`,
          'Content-type': 'application/json',
        },
        data: {
          SystemMode: value,
          Permanent: mode, // true of false
          TimeUntil: time, // null
        },
      });
    } catch (err) {
      if (err.response.status !== 200) {
        this.log(`setQuikAction Resource could not be found: ${err.response.status}`);
      }
    }
  }

}

module.exports = Evohome;
