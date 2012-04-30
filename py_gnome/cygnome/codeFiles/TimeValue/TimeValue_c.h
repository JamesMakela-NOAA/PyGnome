/*
 *  TimeValue_c.h
 *  gnome
 *
 *  Created by Generic Programmer on 10/20/11.
 *  Copyright 2011 __MyCompanyName__. All rights reserved.
 *
 */

#ifndef __TimeValue_c__
#define __TimeValue_c__

#include "Earl.h"
#include "TypeDefs.h"
#include "ClassID/ClassID_c.h"

#ifdef pyGNOME
#define TMover Mover_c
#endif

class TMover;

class TimeValue_c : virtual public ClassID_c {
	
public:
	TMover *owner;
	
	TimeValue_c() { owner = 0; }
	TimeValue_c (TMover *theOwner) { owner = theOwner; }
	virtual OSErr	GetTimeValue (Seconds time, VelocityRec *value);
	virtual OSErr	CheckStartTime (Seconds time);
	virtual void	Dispose () {}
	virtual ClassID GetClassID () { return TYPE_TIMEVALUES; }
	virtual Boolean	IAm(ClassID id) { if(id==TYPE_TIMEVALUES) return TRUE; return ClassID_c::IAm(id); }	
	virtual OSErr	InitTimeFunc ();

};

#undef TMover
#endif