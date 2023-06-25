'use strict';

const { Driver } = require('homey');

class quickActionDriver extends Driver {

  async onInit() {
    this.log('EvoHomeDriver quikaction has been initialized');
  }

  async onRepair(session) {
    session.setHandler('login', async (data) => {
      const credentialsAreValid = await this.homey.app.loginServices(data.username, data.password).catch(this.error);

      if (!credentialsAreValid) {
        return credentialsAreValid;
      }
      return credentialsAreValid;
    });
  }

  async onPair(session) {
    session.setHandler('login', async (data) => {
      const credentialsAreValid = await this.homey.app.loginServices(data.username, data.password).catch(this.error);

      if (credentialsAreValid) {
        const userAccountPayload = await this.homey.app.getUserAccount().catch(this.error);
        const payload = await this.homey.app.getLocationsZones(userAccountPayload.userId).catch(this.error);
        this.devices = [];
        for (let l = 0; l < payload.length; l++) { //  locations
          for (let g = 0; g < payload[l].gateways.length; g++) { // gateways
            for (let t = 0; t < payload[l].gateways[g].temperatureControlSystems.length; t++) { //  temperatureControlSystems
              this.devices.push(
                {
                  name: `Quickaction-${payload[l].locationInfo.name}`,
                  data: {
                    id: payload[l].gateways[g].temperatureControlSystems[t].systemId,
                    location: payload[l].locationInfo.locationId,
                  },
                },
              );
            }
          }
        }
      }
      return credentialsAreValid;
    });
    session.setHandler('list_devices', async () => {
      return (this.devices) || [];
    });
  }

  async onPairListDevices() {
    return this.devices;
  }

}

module.exports = quickActionDriver;
