GpsdTracking backend take care of storing Data to a database.

  - MySql backend is compliant with Traccar/OpenGts
  - File  backend is only provided for test purpose

A backend should implements following methods

    - CheckTablesExits [create DB table in case they are not present]
    - CreateDev        [create an entry for device in DB]
    - RemoveDev        [remove device entry in DB]
    - UpdateDev        [update device position in DB]
         AUTH_IMEI    -- verify device exist
         UPDATE_POS   -- add a new track point in DB for device
         LOGOUT       -- what every you want for your stat.

Note:

 -  backend does not take care of your application, this is the why
    no "query" of DB need to be implemented.
 -  if you have a mysql, with a different DB schema, just create a custom
    one from this one.
 -  Under nodejs Most DB requests are asynchronous. Don't forget about it
    during your design.

Fulup