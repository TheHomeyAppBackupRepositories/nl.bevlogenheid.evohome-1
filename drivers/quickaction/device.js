/* eslint-disable max-len */

'use strict';

const { Device } = require('homey');
const eventBus = require('@tuxjs/eventbus');

class quickActionDevice extends Device {

  async onInit() {
    await this.initAfterLogin();

    this.registerCapabilityListener('quickaction', this.onCapabilityQuickAction.bind(this));

    // eventbus for incoming data
    eventBus.subcribe('zoneStatusQuikActionStatus', async (payload) => {
      await this.updateStatus(payload);
    });
  }

  async initAfterLogin() {
    const interval = this.homey.setInterval(async () => {
      const succesFullogin = await this.homey.app.checkSuccesfulLogin().catch(this.error);
      if (succesFullogin) {
        await this.getLocationID(); // check if location code is different in homey and on api.
        this.log('---------------------------------------------------------------------------------------');
        this.log(`INIT device QUIKACTION: ${this.getName()} ---ID: ${this.getData().id}`);
        this.log(`INIT device QUIKACTION: ${this.getName()} ---LOCATION_ID(homey):   ${this.getData().location}`);
        this.log(`INIT device QUIKACTION: ${this.getName()} ---LOCATION_ID(evohome): ${this.newLocationID}`);
        this.log('---------------------------------------------------------------------------------------');
        clearInterval(interval);
        await this.homey.app.getZonesStatusSystemModeStatus(this.newLocationID);
      }
    }, 5000); // 5 sec  interval
  }

  // When a user change the target temperature in homey
  async onCapabilityQuickAction(value) {
    await this.homey.app.setQuikAction(this.getData().id, value, true, null).catch(this.error);
    this.log(`Set(toEvoHome) quickaction to ${value} for system: ${this.getName()} ---ID: ${this.getData().id}}`);
  }

  // updates and proccess a zone device with received data from the eventbus
  async updateStatus(payload) {
    const httpGetLocationId = payload[1].path.match(/\d+[0-9]/); // get te locationID from the http response.
    if (httpGetLocationId !== null) {
      if (httpGetLocationId[0] === this.newLocationID) {
        const p = payload[0];
        for (let g = 0; g < p.gateways.length; g++) {
          for (let tcs = 0; tcs < p.gateways[g].temperatureControlSystems.length; tcs++) {
            if (this.getData().id === p.gateways[g].temperatureControlSystems[tcs].systemId) { // compare ZoneID for futher handling
              if (this.getCapabilityValue('quickaction') !== p.gateways[g].temperatureControlSystems[tcs].systemModeStatus.mode) {
                await this.setCapabilityValue('quickaction', p.gateways[g].temperatureControlSystems[tcs].systemModeStatus.mode).catch(this.error);
                this.log(`Set(toHomey) quickaction to ${p.gateways[g].temperatureControlSystems[tcs].systemModeStatus.mode} for system: ${this.getName()} ---ID: ${this.getData().id}`);
              }
            }
          }
        }
      }
    }
  }

  async onDeleted() {
    this.log('---------------------------------------------------------------------------------------');
    this.log(`DELETED device QUIKACTION: ${this.getName()} ---ID: ${this.getData().id}`);
    this.log(`DELETED device QUIKACTION: ${this.getName()} ---LOCATION_ID(homey):   ${this.getData().location}`);
    this.log(`DELETED device QUIKACTION: ${this.getName()} ---LOCATION_ID(evohome): ${this.newLocationID}`);
    this.log('---------------------------------------------------------------------------------------');
  }

  // gets the locationId from the API could be different then the one in this.getData().location
  async getLocationID() {
    const userAccountPayload = await this.homey.app.getUserAccount().catch(this.error);
    const locactionPayload = await this.homey.app.getLocationsZones(userAccountPayload.userId).catch(this.error);

    for (let l = 0; l < locactionPayload.length; l++) { //  locations
      for (let g = 0; g < locactionPayload[l].gateways.length; g++) { // gateways
        for (let t = 0; t < locactionPayload[l].gateways[g].temperatureControlSystems.length; t++) { //  temperatureControlSystems
          if (this.getData().id === locactionPayload[l].gateways[g].temperatureControlSystems[t].systemId) {
            await this.homey.app.createLocationsArray(this.getData().location, locactionPayload[l].locationInfo.locationId);
            this.newLocationID = locactionPayload[l].locationInfo.locationId;
          }
        }
      }
    }
  }

}

module.exports = quickActionDevice;
