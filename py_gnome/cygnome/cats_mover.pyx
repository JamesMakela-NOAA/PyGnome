import cython
cimport numpy as np
import numpy as np

include "cats_mover.pxi"
include "shio_time.pxi"
include "map.pxi"

cdef class cats_mover:

    cdef CATSMover_c *mover
    
    def __cinit__(self):
        self.mover = new CATSMover_c()
    
    def __dealloc__(self):
        del self.mover
    
    def __init__(self, scale_type, scale_value=1, diffusion_coefficient=1):
        cdef WorldPoint p
        self.mover.scaleType = scale_type
        self.mover.scaleValue = scale_value
        self.mover.fEddyDiffusion = diffusion_coefficient
        ## should not have to do this manually.
        ## make-shifting for now.
        self.mover.fOptimize.isOptimizedForStep = 0
        self.mover.fOptimize.isFirstStep = 1  
            
    def set_shio(self, shio_file):
        cdef ShioTimeValue_c *shio
        shio = new ShioTimeValue_c()
        if(shio.ReadTimeValues(shio_file) == -1):
            return False
        self.mover.SetTimeDep(shio)
        self.mover.SetRefPosition(shio.GetRefWorldPoint(), 0)
        self.mover.bTimeFileActive = True
        return True
        
    def set_ref_point(self, ref_point):
        cdef WorldPoint p
        p.pLong = ref_point[0]*10**6
        p.pLat = ref_point[1]*10**6
        self.mover.SetRefPosition(p, 0)
        
    def read_topology(self, path):
        cdef Map_c **naught
        #fixme: why might this fail? 
        # does **naught have to be initialized?
        if(self.mover.ReadTopology(path, naught)):
            return False
        return True
    
    def get_move_uncertain(self, n, model_time, start_time, step_len, np.ndarray[WorldPoint3D, ndim=1] ref_ra, np.ndarray[WorldPoint3D, ndim=1] wp_ra, np.ndarray[np.npy_double] wind_ra, np.ndarray[np.npy_short] dispersion_ra, double f_sigma_vel, double f_sigma_theta, double breaking_wave, double mix_layer, np.ndarray[LEWindUncertainRec] uncertain_ra, np.ndarray[TimeValuePair] time_vals, int num_times):
        cdef:
            char *time_vals_ptr
            char *uncertain_ptr
            char *world_points
            
        N = len(wp_ra)
        M = len(time_vals)
        ref_points = ref_ra.data
        world_points = wp_ra.data
        time_vals_ptr = time_vals.data
        uncertain_ptr = uncertain_ra.data

        self.mover.PrepareForModelStep(model_time, start_time, step_len, True) 
        self.mover.get_move(N, model_time, step_len, ref_points, world_points, uncertain_ptr, time_vals_ptr, M)

    def get_move(self, n, model_time, start_time, step_len, np.ndarray[WorldPoint3D, ndim=1] ref_ra, np.ndarray[WorldPoint3D, ndim=1] wp_ra, np.ndarray[np.npy_double] wind_ra, np.ndarray[np.npy_short] dispersion_ra, double breaking_wave, double mix_layer, np.ndarray[TimeValuePair] time_vals, int num_times):
        cdef:
            char *time_vals_ptr
            char *uncertain_ptr
            char *world_points
            
        N = len(wp_ra)
        M = len(time_vals)
        ref_points = ref_ra.data
        world_points = wp_ra.data
        time_vals_ptr = time_vals.data

        self.mover.PrepareForModelStep(model_time, start_time, step_len, False) 
        self.mover.get_move(N, model_time, step_len, ref_points, world_points, time_vals_ptr, M)

    def compute_velocity_scale(self, model_time):
        self.mover.ComputeVelocityScale(model_time)
        
    def set_velocity_scale(self, scale_value):
        self.mover.refScale = scale_value
        