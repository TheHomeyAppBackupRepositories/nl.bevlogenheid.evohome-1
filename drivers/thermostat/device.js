/* eslint-disable max-len */

'use strict';

const { Device } = require('homey');
const eventBus = require('@tuxjs/eventbus');

class ThermostatDevice extends Device {

  async onInit() {
    await this.initAfterLogin();

    if (!this.hasCapability('alarm_battery')) {
      this.addCapability('alarm_battery');
    }

    this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));

    // eventbus for incoming data
    eventBus.subcribe('zoneStatusQuikActionStatus', async (payload) => {
      await this.updateStatus(payload);
    });
  }

  // init device after succesful login
  async initAfterLogin() {
    const interval = this.homey.setInterval(async () => {
      const succesFullogin = await this.homey.app.checkSuccesfulLogin().catch(this.error);
      if (succesFullogin) {
        await this.getLocationID(); // check if location code is different in homey and on api.
        this.log('---------------------------------------------------------------------------------------');
        this.log(`INIT device ZONE: ${this.getName()} ---ID: ${this.getData().id}`);
        this.log(`INIT device ZONE: ${this.getName()} ---LOCATION_ID(homey):   ${this.getData().location}`);
        this.log(`INIT device ZONE: ${this.getName()} ---LOCATION_ID(evohome): ${this.newLocationID}`);
        this.log('---------------------------------------------------------------------------------------');
        clearInterval(interval);
        await this.homey.app.getZonesStatusSystemModeStatus(this.newLocationID);
      }
    }, 5000); // 5 sec  interval
  }

  // When a user change the target temperature in homey
  async onCapabilityTargetTemperature(value) {
    await this.homey.app.setTargetTemperature(this.getData().id, Number(value), 'PermanentOverride', null).catch(this.error);
    this.log(`Set(toEvoHome) target temperature to ${value} for ZONE: ${this.getName()} ---ID: ${this.getData().id}`);
  }

  // updates and process a zone device with received data from the eventbus
  async updateStatus(payload) {
    const httpGetLocationId = payload[1].path.match(/\d+[0-9]/); // get te locationID from the http response.
    if (httpGetLocationId !== null) {
      if (httpGetLocationId[0] === this.newLocationID || httpGetLocationId[0] === undefined) {
        const p = payload[0];
        for (let g = 0; g < p.gateways.length; g++) {
          for (let tcs = 0; tcs < p.gateways[g].temperatureControlSystems.length; tcs++) {
            for (let z = 0; z < p.gateways[g].temperatureControlSystems[tcs].zones.length; z++) {
              if (this.getData().id === p.gateways[g].temperatureControlSystems[tcs].zones[z].zoneId) { // compare ZoneID for futher handling
                if (this.getCapabilityValue('measure_temperature') !== Number(p.gateways[g].temperatureControlSystems[tcs].zones[z].temperatureStatus.temperature)) {
                  await this.setCapabilityValue('measure_temperature', Number(p.gateways[g].temperatureControlSystems[tcs].zones[z].temperatureStatus.temperature)).catch(this.error);
                  this.log(`Set(toHomey) temperatures to ${Number(p.gateways[g].temperatureControlSystems[tcs].zones[z].temperatureStatus.temperature)} for ZONE: ${this.getName()} ---ID: ${this.getData().id}`);
                }

                if (this.getCapabilityValue('target_temperature') !== Number(p.gateways[g].temperatureControlSystems[tcs].zones[z].setpointStatus.targetHeatTemperature)) {
                  await this.setCapabilityValue('target_temperature', Number(p.gateways[g].temperatureControlSystems[tcs].zones[z].setpointStatus.targetHeatTemperature)).catch(this.error);
                  this.log(`Set(toHomey) target temperatures to ${Number(p.gateways[g].temperatureControlSystems[tcs].zones[z].setpointStatus.targetHeatTemperature)} for ZONE: ${this.getName()} ---ID: ${this.getData().id}`);
                }

                if (p.gateways[g].temperatureControlSystems[tcs].zones[z].activeFaults.length === 0) {
                  if (this.getCapabilityValue('alarm_battery')) {
                    await this.setCapabilityValue('alarm_battery', false).catch(this.error);
                    this.log(`Set(toHomey) battery alarm to FALSE for ZONE: ${this.getName()} ---ID: ${this.getData().id}`);
                  }
                  continue;
                } else {
                  this.log(`FAULT on device: ${p.gateways[g].temperatureControlSystems[tcs].zones[z].activeFaults}`); // log all active faults.
                }

                for (let af = 0; af < p.gateways[g].temperatureControlSystems[tcs].zones[z].activeFaults.length; af++) {
                  if (p.gateways[g].temperatureControlSystems[tcs].zones[z].activeFaults[af].faultType === 'TempZoneActuatorLowBattery'
                  || p.gateways[g].temperatureControlSystems[tcs].zones[z].activeFaults[af].faultType === 'TempZoneSensorLowBattery') {
                    if (!this.getCapabilityValue('alarm_battery')) {
                      await this.setCapabilityValue('alarm_battery', true).catch(this.error);
                      this.log(`Set(toHomey) battery alarm to TRUE for ZONE: ${this.getName()} ---ID: ${this.getData().id}`);
                    }
                  } else if (this.getCapabilityValue('alarm_battery')) {
                    await this.setCapabilityValue('alarm_battery', false).catch(this.error);
                    this.log(`Set(toHomey) battery alarm to FALSE for ZONE: ${this.getName()} ---ID: ${this.getData().id}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  async onDeleted() {
    this.log('---------------------------------------------------------------------------------------');
    this.log(`DELETED device ZONE: ${this.getName()} ---ID: ${this.getData().id}`);
    this.log(`DELETED device ZONE: ${this.getName()} ---LOCATION_ID(homey):   ${this.getData().location}`);
    this.log(`DELETED device ZONE: ${this.getName()} ---LOCATION_ID(evohome): ${this.newLocationID}`);
    this.log('---------------------------------------------------------------------------------------');
  }

  // gets the locationId from the API could be different then the one in this.getData().location
  async getLocationID() {
    const userAccountPayload = await this.homey.app.getUserAccount().catch(this.error);
    const locactionPayload = await this.homey.app.getLocationsZones(userAccountPayload.userId).catch(this.error);

    for (let l = 0; l < locactionPayload.length; l++) { //  locations
      for (let g = 0; g < locactionPayload[l].gateways.length; g++) { // gateways
        for (let t = 0; t < locactionPayload[l].gateways[g].temperatureControlSystems.length; t++) { //  temperatureControlSystems
          for (let z = 0; z < locactionPayload[l].gateways[g].temperatureControlSystems[t].zones.length; z++) { //  zones
            if (this.getData().id === locactionPayload[l].gateways[g].temperatureControlSystems[t].zones[z].zoneId) {
              await this.homey.app.createLocationsArray(this.getData().location, locactionPayload[l].locationInfo.locationId);
              this.newLocationID = locactionPayload[l].locationInfo.locationId;
            }
          }
        }
      }
    }
  }

}

module.exports = ThermostatDevice;
